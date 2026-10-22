"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  regeneratePublicApiKeyAction,
  revokePublicApiKeyAction,
  setPublicApiOriginsAction,
  setWebsiteModeAction,
} from "../actions/business-settings-actions";
import type { Business, WebsiteMode } from "../domain/business";

/**
 * Mission 027 (correction) / Mission 028 — the settings UI for the
 * WeGO Auto Conversion Layer. Deliberately reads its two capability
 * flags (`canUseStorefront` / `canUseIntegration`) from the server via
 * props rather than re-deriving them client-side, so
 * EntitlementService stays the one place that decides what a plan
 * unlocks — this component only ever *displays* that decision and
 * calls the already-permission-gated server actions, never
 * re-implements the gate itself.
 */
export function ConversionSettings({
  business,
  canUseStorefront,
  canUseIntegration,
}: {
  business: Business;
  canUseStorefront: boolean;
  canUseIntegration: boolean;
}) {
  const [websiteMode, setWebsiteMode] = useState<WebsiteMode>(business.websiteMode);
  const [keyHint, setKeyHint] = useState(business.publicApiKeyHint);
  // Mission 037 — the plaintext key exists only here, only until the owner leaves/refreshes the page.
  const [newKey, setNewKey] = useState<string | null>(null);
  const [originsText, setOriginsText] = useState(business.publicApiAllowedOrigins.join("\n"));
  const [originsMessage, setOriginsMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<"website" | "key" | "origins" | null>(null);

  const changeWebsiteMode = async (mode: WebsiteMode) => {
    setBusy("website");
    const result = await setWebsiteModeAction(mode);
    if (result.ok) setWebsiteMode(result.business.websiteMode);
    setBusy(null);
  };

  const rotateKey = async () => {
    setBusy("key");
    const result = await regeneratePublicApiKeyAction();
    if (result.ok) {
      setKeyHint(result.business.publicApiKeyHint);
      setNewKey(result.newApiKey ?? null);
    }
    setBusy(null);
  };

  const saveOrigins = async () => {
    setBusy("origins");
    setOriginsMessage(null);
    const result = await setPublicApiOriginsAction(originsText.split("\n"));
    if (result.ok) {
      setOriginsText(result.business.publicApiAllowedOrigins.join("\n"));
      setOriginsMessage("Saved.");
    } else {
      setOriginsMessage(result.error.message);
    }
    setBusy(null);
  };

  const revokeKey = async () => {
    setBusy("key");
    const result = await revokePublicApiKeyAction();
    if (result.ok) {
      setKeyHint(result.business.publicApiKeyHint);
      setNewKey(null);
    }
    setBusy(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Website</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Tell Atlas how customers reach you online — through your own site, an Atlas-hosted page, or neither yet.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={websiteMode === "none" ? "default" : "outline"}
              onClick={() => changeWebsiteMode("none")}
              disabled={busy === "website"}
            >
              No website yet
            </Button>
            <Button
              variant={websiteMode === "own_website" ? "default" : "outline"}
              onClick={() => changeWebsiteMode("own_website")}
              disabled={busy === "website"}
            >
              I have my own website
            </Button>
            <Button
              variant={websiteMode === "atlas_hosted" ? "default" : "outline"}
              onClick={() => changeWebsiteMode("atlas_hosted")}
              disabled={busy === "website" || !canUseStorefront}
            >
              {busy === "website" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Use Atlas-hosted storefront
            </Button>
          </div>
          {!canUseStorefront ? (
            <p className="text-sm text-muted-foreground">
              The Atlas-hosted storefront isn&apos;t included in your current plan.
            </p>
          ) : null}
          {websiteMode === "atlas_hosted" ? (
            <a
              href={`/site/${business.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline-offset-2 hover:underline"
            >
              View your storefront →
            </a>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Website integration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            If you already have a website, use this key to pull your Atlas inventory and send inquiries into Atlas
            from your own site.
          </p>
          {canUseIntegration ? (
            <div className="flex flex-col gap-2">
              {newKey ? (
                <div className="flex flex-col gap-1">
                  <code className="w-fit break-all rounded bg-muted px-2 py-1 text-xs">{newKey}</code>
                  <p className="text-sm text-amber-600">
                    Copy this key now. For your security it is shown only once and can&apos;t be retrieved later — if you
                    lose it, rotate to get a new one.
                  </p>
                </div>
              ) : keyHint ? (
                <code className="w-fit rounded bg-muted px-2 py-1 text-xs">{keyHint}</code>
              ) : (
                <p className="text-sm text-muted-foreground">No API key generated yet.</p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={rotateKey} disabled={busy === "key"}>
                  {busy === "key" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {keyHint ? "Rotate key" : "Generate key"}
                </Button>
                {keyHint ? (
                  <Button variant="ghost" onClick={revokeKey} disabled={busy === "key"}>
                    Revoke
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <p className="text-sm font-medium">Allowed website origins</p>
                <p className="text-sm text-muted-foreground">
                  If you call Atlas from your website&apos;s browser code, the key is visible to visitors. List your site
                  address(es) here, one per line (e.g. https://yourshop.co.ke), and Atlas will reject browser requests
                  from anywhere else. Leave empty to allow any origin.
                </p>
                <textarea
                  value={originsText}
                  onChange={(event) => setOriginsText(event.target.value)}
                  rows={3}
                  className="w-full max-w-md rounded-md border bg-background px-2 py-1 text-sm"
                  placeholder="https://yourshop.co.ke"
                />
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={saveOrigins} disabled={busy === "origins"}>
                    {busy === "origins" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save origins
                  </Button>
                  {originsMessage ? <span className="text-sm text-muted-foreground">{originsMessage}</span> : null}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not included in your current plan.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
