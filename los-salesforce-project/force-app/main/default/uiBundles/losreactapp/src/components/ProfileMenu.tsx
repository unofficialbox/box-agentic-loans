import { useEffect, useRef, useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { initialsFor, signInReturnUrl, type LosIdentity } from "../lib/identity";

/**
 * Who is looking at this page.
 *
 * The scoping is the claim this app makes -- a borrower sees their own loans and
 * nobody else's -- and until now nothing on screen said who "their own" referred to, so a
 * presenter had to assert it. Naming the person and their account beside the filtered list
 * turns the claim into evidence.
 *
 * It is also the fastest read on a class of failure this repo kept hitting: a session
 * expires, every panel reports its own symptom, and nothing says the reader is signed out.
 *
 * Deliberately shallow. A borrower portal has nothing to put behind an avatar, so the
 * menu holds one item and there is no profile page behind it.
 */
export function ProfileMenu({ identity }: { identity: LosIdentity | null }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Nothing is drawn until the answer arrives. A "Sign in" button that appears and then
  // becomes an avatar reads as having been signed out for a moment.
  if (!identity) return null;

  if (identity.isGuest) {
    return identity.loginUrl ? (
      <a className="signin-button" href={signInReturnUrl(identity.loginUrl)} data-testid="profile-signin">
        <LogIn size={15} aria-hidden="true" /> Sign in
      </a>
    ) : (
      <span className="profile-signed-out" data-testid="profile-signed-out">Signed out</span>
    );
  }

  const name = identity.name || "Signed in";

  return (
    <div className="profile" ref={wrapper} data-testid="profile-menu">
      <button
        type="button"
        className="profile-button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="profile-avatar" aria-hidden="true">{initialsFor(name)}</span>
        <span className="profile-copy">
          <strong>{name}</strong>
          {identity.accountName ? <small>{identity.accountName}</small> : null}
        </span>
      </button>

      {open ? (
        <div className="profile-sheet" role="menu">
          <div className="profile-sheet-head">
            <strong>{name}</strong>
            {identity.accountName ? <small>{identity.accountName}</small> : null}
          </div>
          {identity.logoutUrl ? (
            <a className="profile-sheet-item" role="menuitem" href={identity.logoutUrl} data-testid="profile-signout">
              <LogOut size={15} aria-hidden="true" /> Sign out
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
