import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectMetaPageAction, disconnectMetaPageAction } from "../actions/meta-connection-actions";

/** Mission 039 — Messenger / Instagram connection card on the Assistant settings page. Server-rendered; the token is write-only. */
export function MetaConnectCard({
  pageId,
  instagramAccountId,
  notice,
  error,
  serverReady,
}: {
  pageId: string | null;
  instagramAccountId: string | null;
  notice: string | null;
  error: string | null;
  /** Whether the server has META_APP_SECRET set (without it the webhook refuses all traffic). */
  serverReady: boolean;
}) {
  const connected = Boolean(pageId);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Messenger &amp; Instagram</CardTitle>
        <CardDescription>
          Lets the assistant answer direct messages on your Facebook Page and linked Instagram account from your live inventory, and pass real enquiries to
          your team. It only replies to customers who message you first. Requires the Growth or Pro plan.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {notice ? (
          <p role="status" className="rounded-md border border-success/25 bg-success/10 px-3 py-2 text-sm text-success">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {!serverReady ? (
          <p className="text-sm text-muted-foreground">The server isn&apos;t configured for Meta messaging yet (META_APP_SECRET is missing), so messages won&apos;t arrive until it is.</p>
        ) : null}

        {connected ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Connected — Page <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{pageId}</code>
              {instagramAccountId ? (
                <>
                  {" "}
                  and Instagram <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{instagramAccountId}</code>
                </>
              ) : null}
              . The access token is stored encrypted and can&apos;t be viewed again.
            </p>
            <form action={disconnectMetaPageAction}>
              <Button type="submit" variant="outline">
                Disconnect
              </Button>
            </form>
          </div>
        ) : null}

        <form action={connectMetaPageAction} className="flex flex-col gap-3">
          <p className="text-sm font-medium">{connected ? "Replace the connection" : "Connect a Page"}</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meta-pageId">Facebook Page ID</Label>
            <Input id="meta-pageId" name="pageId" inputMode="numeric" maxLength={30} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meta-instagramAccountId">Instagram account ID (optional)</Label>
            <Input id="meta-instagramAccountId" name="instagramAccountId" inputMode="numeric" maxLength={30} />
            <p className="text-xs text-muted-foreground">The Instagram professional account linked to this Page.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meta-accessToken">Page access token</Label>
            <Input id="meta-accessToken" name="accessToken" type="password" autoComplete="off" maxLength={1000} required />
            <p className="text-xs text-muted-foreground">
              Atlas checks with Meta that this token belongs to the Page above before saving anything. Use a long-lived Page access token with messaging permissions.
            </p>
          </div>
          <div>
            <Button type="submit">{connected ? "Verify and replace" : "Verify and connect"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
