/** Server-side borrower projection. No folder read token is exposed to the browser. */
public with sharing class LosBorrowerDocuments {
    // Files visible to borrowers - excludes only "Internal" bank documents
    // Null versionStatus is allowed (shows files before Box Extract completes)
    private static final Set<String> INTERNAL_ONLY_STATUSES = new Set<String>{'Internal', 'Bank Only'};
    public class ListingException extends Exception {}

    public static List<Object> listFiles(String folderId, String token) {
        List<Object> visible = new List<Object>();
        Integer offset = 0;
        // Fail rather than silently truncate an unexpectedly large loan file.
        for (Integer page = 0; page < 20; page++) {
            HttpRequest req = new HttpRequest();
            req.setEndpoint('callout:LOS_Box/2.0/folders/' + folderId + '/items?limit=100&offset=' + offset
                + '&fields=id,name,type,size,extension,modified_at,metadata.enterprise.losDocument');
            req.setMethod('GET');
            req.setHeader('Authorization', 'Bearer ' + token);
            HttpResponse res = new Http().send(req);
            if (res.getStatusCode() != 200) throw new ListingException('Box listing failed');
            Map<String,Object> parsed = (Map<String,Object>)JSON.deserializeUntyped(res.getBody());
            List<Object> entries = (List<Object>)parsed.get('entries');
            if (entries == null) throw new ListingException('Box listing missing entries');
            for (Object entry : entries) {
                Map<String,Object> file = (Map<String,Object>)entry;
                Map<String,Object> metadata = objectMap(file.get('metadata'));
                Map<String,Object> enterprise = objectMap(metadata.get('enterprise'));
                Map<String,Object> document = objectMap(enterprise.get('losDocument'));
                String versionStatus = (String)document.get('versionStatus');
                // Show files unless explicitly marked as internal-only
                if ((String)file.get('type') != 'file' || INTERNAL_ONLY_STATUSES.contains(versionStatus)) continue;
                // Never return bank risk/approval metadata, even on borrower-visible files.
                Map<String,Object> safe = new Map<String,Object>();
                for (String key : new List<String>{'id','name','type','size','extension','modified_at'}) safe.put(key,file.get(key));
                safe.put('metadata', new Map<String,Object>{'enterprise' => new Map<String,Object>{
                    'losDocument' => new Map<String,Object>{'documentType' => document.get('documentType'),
                        'versionStatus' => document.get('versionStatus')}}});
                visible.add(safe);
            }
            offset += entries.size();
            Integer total = parsed.get('total_count') == null ? offset : Integer.valueOf(parsed.get('total_count'));
            if (offset >= total) return visible;
            if (entries.isEmpty()) throw new ListingException('Box pagination did not advance');
        }
        throw new ListingException('Loan folder exceeds supported listing size');
    }
    public static Boolean containsFile(List<Object> files, String fileId) {
        for (Object file : files) if ((String)((Map<String,Object>)file).get('id') == fileId) return true;
        return false;
    }
    private static Map<String,Object> objectMap(Object value) {
        return value == null ? new Map<String,Object>() : (Map<String,Object>)value;
    }
}
