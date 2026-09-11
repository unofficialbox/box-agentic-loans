import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ProfileMenu } from "./ProfileMenu";
import { initialsFor } from "../lib/identity";

describe("ProfileMenu", () => {
  test("names the reader and the account their rows are bounded to", () => {
    // The scoping is this app's claim. Until it was on screen a presenter had to assert
    // who "your loans" belonged to.
    render(<ProfileMenu identity={{ isGuest: false, name: "Dana Whitfield", accountName: "Dockwright Logistics" }} />);
    expect(screen.getByText("Dana Whitfield")).toBeVisible();
    expect(screen.getByText("Dockwright Logistics")).toBeVisible();
  });

  test("offers a way in when signed out, and never an avatar over nobody", () => {
    render(<ProfileMenu identity={{ isGuest: true, loginUrl: "https://example.invalid/login" }} />);
    expect(screen.getByTestId("profile-signin")).toHaveAttribute("href", "https://example.invalid/login?startURL=%2F");
    expect(screen.queryByTestId("profile-menu")).not.toBeInTheDocument();
  });

  test("still says signed out when the site supplies no login URL", () => {
    render(<ProfileMenu identity={{ isGuest: true }} />);
    expect(screen.getByTestId("profile-signed-out")).toBeVisible();
  });

  test("draws nothing until the answer arrives", () => {
    // A Sign in button that becomes an avatar reads as having been signed out for a moment.
    const { container } = render(<ProfileMenu identity={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("opens a menu with sign out, and closes on Escape", () => {
    render(
      <ProfileMenu
        identity={{ isGuest: false, name: "Dana Whitfield", logoutUrl: "https://example.invalid/logout" }}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("profile-signout")).toHaveAttribute("href", "https://example.invalid/logout");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("profile-signout")).not.toBeInTheDocument();
  });
});

describe("initialsFor", () => {
  test("takes the first and last name, so a middle name does not crowd the avatar", () => {
    expect(initialsFor("Dana Whitfield")).toBe("DW");
    expect(initialsFor("Dana May Whitfield")).toBe("DW");
    expect(initialsFor("Dana")).toBe("D");
    expect(initialsFor("   ")).toBe("?");
  });
});
