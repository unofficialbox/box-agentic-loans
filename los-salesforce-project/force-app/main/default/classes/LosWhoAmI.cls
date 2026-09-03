/**
 * Who is looking at this page, and where they sign in or out.
 *
 * The workspace shows a borrower only their own loans, and that scoping is the
 * whole claim the demo makes. Nothing on screen said who "their own" referred to, so the
 * claim had to be asserted rather than shown. Naming the signed-in user and their account
 * beside the filtered list turns it into evidence.
 *
 * It also removes a failure this repo hit repeatedly: a session expires, the UI API bridge
 * refuses, and every panel reports its own symptom while nothing says the reader is signed
 * out. `isGuest` is the one fact that explains all of them at once.
 *
 * The URLs come from the platform rather than from configuration because they are not
 * derivable in the browser: the site serves this bundle for every path beneath the app
 * prefix, so `/login` under it renders the app rather than a sign-in page. `Network`
 * knows the real ones.
 *
 * The projection is deliberately three facts. A borrower portal has nothing else to
 * put behind an avatar, and every field added here is published to whoever opens the site.
 */
@RestResource(urlMapping='/los/whoami/*')
global with sharing class LosWhoAmI {

    global class Identity {
        /** True for an unauthenticated site visitor. The one fact worth branching on. */
        global Boolean isGuest;
        /** Null for a guest; there is nobody to name. */
        global String name;
        /** The account whose loans this reader may see. Null for an internal user. */
        global String accountName;
        global String loginUrl;
        global String logoutUrl;
    }

    @HttpGet
    global static void whoAmI() {
        RestResponse response = RestContext.response;
        response.addHeader('Content-Type', 'application/json');

        Identity identity = new Identity();
        identity.isGuest = UserInfo.getUserType() == 'Guest';
        identity.loginUrl = siteUrl(true);
        identity.logoutUrl = logoutUrl(siteUrl(false), identity.loginUrl);

        if (!identity.isGuest) {
            identity.name = UserInfo.getName();
            identity.accountName = new Resolver().accountName();
        }

        response.statusCode = 200;
        response.responseBody = Blob.valueOf(JSON.serialize(identity));
    }

    /**
     * Off a community there is no network to ask, and the call throws rather than
     * returning null. A missing URL costs a button; it must not cost the identity.
     */
    private static String siteUrl(Boolean wantLogin) {
        try {
            Id networkId = Network.getNetworkId();
            if (networkId == null) {
                return null;
            }
            return wantLogin ? Network.getLoginUrl(networkId) : Network.getLogoutUrl(networkId);
        } catch (Exception ignored) {
            return null;
        }
    }

    /**
     * `Network.getLogoutUrl` answers with the community's *custom* logout URL, and a
     * community that has not configured one returns null -- which is most of them, and was
     * this one. The default logout lives beside the login page on the site's own path
     * prefix, so the login URL is the thing that knows where it is.
     *
     * Derived only from a URL that ends in `/login`, because appending to anything else
     * would invent a path. No login URL, no logout button; the menu simply omits it.
     */
    private static String logoutUrl(String configured, String loginUrl) {
        if (String.isNotBlank(configured)) {
            return configured;
        }
        if (String.isBlank(loginUrl) || !loginUrl.endsWith('/login')) {
            return null;
        }
        return loginUrl.removeEnd('/login') + '/secur/logout.jsp';
    }

    /**
     * `without sharing`, and it reads only the running user's own row -- the same
     * concession LosBorrowerLoans makes and for the same reason: a community user
     * cannot read their own User record under sharing, and the value returned is their
     * own account name, which they are already being shown rows from.
     *
     * An internal user has no Contact and so no account name, which is correct rather than
     * a gap: this names the account a borrower's rows are bounded to, and an internal
     * reader is not bounded to one.
     */
    private without sharing class Resolver {
        private String accountName() {
            // Schema-qualified, and ContactId selected explicitly: an unqualified User
            // resolves ambiguously here and the compiler reports it as "Illegal assignment
            // from List<User> to List<User>", naming neither the type nor the cause.
            // LosBorrowerLoans hit the same thing and records it too.
            List<Schema.User> users = [
                SELECT Id, ContactId, Contact.Account.Name
                FROM User
                WHERE Id = :UserInfo.getUserId()
                LIMIT 1
            ];
            if (users.isEmpty() || users[0].ContactId == null || users[0].Contact.Account == null) {
                return null;
            }
            return users[0].Contact.Account.Name;
        }
    }
}
