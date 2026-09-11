@isTest
private class BoxEmailAttachmentUploaderTest {

    private static void assertRoundTrip(String content) {
        String attrs = '{"name":"dockwright-loan-application-2026.pdf","parent":{"id":"402886371976"}}';
        Blob mp = BoxEmailAttachmentUploader.buildMultipart('bnd123', attrs, 'dockwright-loan-application-2026.pdf', Blob.valueOf(content));
        String decoded = mp.toString();
        System.assert(decoded.contains('name="attributes"'), 'attributes part present (len=' + content.length() + ')');
        System.assert(decoded.contains('"parent":{"id":"402886371976"}'), 'attributes reference the folder (len=' + content.length() + ')');
        System.assert(decoded.contains('filename="dockwright-loan-application-2026.pdf"'), 'file part names the file (len=' + content.length() + ')');
        // Content must sit byte-exact between the blank-line delimiter and the closing boundary:
        // no stray padding bytes leaking into the file (regression guard).
        System.assert(decoded.endsWith('\r\n\r\n' + content + '\r\n--bnd123--'),
            'file content byte-exact between delimiter and footer (len=' + content.length() + '): tail=' + decoded.right(content.length() + 24));
    }

    @isTest
    static void multipartIsByteExactAcrossAllPaddings() {
        assertRoundTrip('ABCDEF');    // 6 bytes: len % 3 == 0 (no base64 padding)
        assertRoundTrip('ABCDEFG');   // 7 bytes: len % 3 == 1 (base64 '==')
        assertRoundTrip('ABCDEFGH');  // 8 bytes: len % 3 == 2 (base64 '=')
    }

    @isTest
    static void attachmentCarrierHoldsData() {
        BoxEmailAttachmentUploader.Attachment a =
            new BoxEmailAttachmentUploader.Attachment('f.pdf', EncodingUtil.base64Encode(Blob.valueOf('x')));
        System.assertEquals('f.pdf', a.fileName);
        System.assert(String.isNotBlank(a.base64Body), 'base64 body should be set');
    }
}
