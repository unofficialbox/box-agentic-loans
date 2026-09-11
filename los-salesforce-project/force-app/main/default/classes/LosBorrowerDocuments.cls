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
                // Return document approval only; bank risk and credit approval details stay private.
                Map<String,Object> safe = new Map<String,Object>();
                for (String key : new List<String>{'id','name','type','size','extension','modified_at'}) safe.put(key,file.get(key));
                safe.put('metadata', new Map<String,Object>{'enterprise' => new Map<String,Object>{
                    'losDocument' => new Map<String,Object>{'documentType' => document.get('documentType'),
                        'versionStatus' => document.get('versionStatus'),
                        'approvalStatus' => document.get('approvalStatus')}}});
                visible.add(safe);
            }
            offset += entries.size();
            Integer total = parsed.get('total_count') == null ? offset : Integer.valueOf(parsed.get('total_count'));
            if (offset >= total) return visible;
            if (entries.isEmpty()) throw new ListingException('Box pagination did not advance');
        }
        throw new ListingException('Loan folder exceeds supported listing size');
    }
    /** Release only the final copies identified by a verified completed signing request. */
    public static void publishSignedFiles(Map<String,Object> artifacts, String folderId, String token) {
        for (String fileId : artifacts.keySet()) {
            HttpRequest read = new HttpRequest();
            read.setEndpoint('callout:LOS_Box/2.0/files/' + fileId + '?fields=id,path_collection');
            read.setMethod('GET'); read.setHeader('Authorization','Bearer ' + token);
            HttpResponse fileResponse = new Http().send(read);
            if (fileResponse.getStatusCode() != 200) throw new ListingException('Signed output not available');
            Map<String,Object> file = objectMap(JSON.deserializeUntyped(fileResponse.getBody()));
            Boolean inLoan = false;
            List<Object> entries = (List<Object>)objectMap(file.get('path_collection')).get('entries');
            if (entries != null) for (Object entry : entries) {
                if (objectMap(entry).get('id') == folderId) inLoan = true;
            }
            if (!inLoan || file.get('id') != fileId) throw new ListingException('Signed output outside loan');
            Map<String,Object> fields = new Map<String,Object>{
                'documentType'=>objectMap(artifacts.get(fileId)).get('documentType'),
                'versionStatus'=>'Executed','signatureStatus'=>'Signed'
            };
            HttpRequest write = new HttpRequest();
            write.setEndpoint('callout:LOS_Box/2.0/files/' + fileId + '/metadata/enterprise/losDocument');
            write.setMethod('POST'); write.setHeader('Authorization','Bearer ' + token);
            write.setHeader('Content-Type','application/json');write.setBody(JSON.serialize(fields));
            HttpResponse res = new Http().send(write);
            if (res.getStatusCode() == 409) {
                List<Object> patch = new List<Object>();
                for (String key : fields.keySet()) patch.add(new Map<String,Object>{'op'=>'add','path'=>'/'+key,'value'=>fields.get(key)});
                write.setMethod('PUT'); write.setHeader('Content-Type','application/json-patch+json');write.setBody(JSON.serialize(patch));
                res = new Http().send(write);
            }
            if (res.getStatusCode() != 200 && res.getStatusCode() != 201) throw new ListingException('Signed output publication failed');
        }
    }

    /** Only exact Box-confirmed outputs may cross a signing subfolder boundary. */
    public static void addSignedFiles(List<Object> visible, String folderId, String token, String receipt) {
        if (String.isBlank(receipt)) return;
        Map<String,Object> artifacts = objectMap(JSON.deserializeUntyped(receipt));
        for (String fileId : artifacts.keySet()) {
            Map<String,Object> artifact = objectMap(artifacts.get(fileId));
            if (artifact.get('folderId') != folderId || !fileId.isNumeric()) continue;
            HttpRequest req = new HttpRequest();
            req.setEndpoint('callout:LOS_Box/2.0/files/' + fileId
                + '?fields=id,name,type,size,extension,modified_at,path_collection,metadata.enterprise.losDocument');
            req.setMethod('GET'); req.setHeader('Authorization', 'Bearer ' + token);
            HttpResponse res = new Http().send(req);
            // Deleted or inaccessible documents do not grant preview access.
            if (res.getStatusCode() == 404 || res.getStatusCode() == 403) continue;
            if (res.getStatusCode() != 200) throw new ListingException('Signed document lookup failed');
            Map<String,Object> file = objectMap(JSON.deserializeUntyped(res.getBody()));
            Boolean inLoan = false;
            List<Object> ancestors = (List<Object>)objectMap(file.get('path_collection')).get('entries');
            if (ancestors != null) for (Object ancestor : ancestors) {
                if (objectMap(ancestor).get('id') == folderId) inLoan = true;
            }
            Map<String,Object> document = objectMap(objectMap(objectMap(file.get('metadata')).get('enterprise')).get('losDocument'));
            if (!inLoan || file.get('id') != fileId || file.get('type') != 'file'
                || INTERNAL_ONLY_STATUSES.contains((String)document.get('versionStatus'))) continue;
            Map<String,Object> safe = new Map<String,Object>();
            for (String key : new List<String>{'id','name','type','size','extension','modified_at'}) safe.put(key,file.get(key));
            safe.put('metadata', new Map<String,Object>{'enterprise'=>new Map<String,Object>{
                'losDocument'=>new Map<String,Object>{'documentType'=>artifact.get('documentType'),
                    'versionStatus'=>document.get('versionStatus')}}});
            // Replace a direct child with the authoritative signing classification.
            for (Integer i=visible.size()-1; i>=0; i--) {
                if (objectMap(visible[i]).get('id') == fileId) visible.remove(i);
            }
            visible.add(safe);
        }
    }
    public static Boolean containsFile(List<Object> files, String fileId) {
        for (Object file : files) if ((String)((Map<String,Object>)file).get('id') == fileId) return true;
        return false;
    }
    private static Map<String,Object> objectMap(Object value) {
        return value == null ? new Map<String,Object>() : (Map<String,Object>)value;
    }
}
