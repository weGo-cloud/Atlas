"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  generateMarketingContentAction,
  publishContentAction,
  simulateChannelEnquiryAction,
  simulatePublishAction,
  updateMarketingContentAction,
} from "../actions/marketing-actions";
import type { MarketableItemRef } from "../domain/marketing-item-ref";
import type { MarketingContent } from "../domain/marketing-content";
import { isContentStale } from "../domain/marketing-content";
import { CHANNEL_LABEL, CONNECTION_STATUS_LABEL, MARKETING_CHANNELS, type ConnectionStatus, type MarketingChannel, type MarketingPublication } from "../domain/marketing-channel";

/**
 * Mission 031 — the one marketing UI both verticals' inventory detail
 * pages render (Section 12: no AutoMarketingSystem/FurnitureMarketingSystem
 * UI either). Everything here operates on `itemRef` and whatever the
 * server already resolved through the item adapter — this component
 * has no vehicle- or furniture-specific code.
 */
export function MarketingPanel({
  itemRef,
  currentItemUpdatedAt,
  initialContent,
  initialPublications,
  initialChannelStatuses,
  canUseMarketing,
}: {
  itemRef: MarketableItemRef;
  currentItemUpdatedAt: string;
  initialContent: MarketingContent | null;
  initialPublications: MarketingPublication[];
  initialChannelStatuses: Record<MarketingChannel, ConnectionStatus>;
  canUseMarketing: boolean;
}) {
  const [content, setContent] = useState(initialContent);
  const [publications, setPublications] = useState(initialPublications);
  const [channelStatuses] = useState(initialChannelStatuses);
  const [editedCaption, setEditedCaption] = useState(initialContent?.socialCaption ?? "");
  const [editedMessage, setEditedMessage] = useState(initialContent?.whatsappMessage ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [enquiryChannel, setEnquiryChannel] = useState<MarketingChannel | null>(null);
  const [enquiryForm, setEnquiryForm] = useState({ customerName: "", customerPhone: "", message: "" });
  const [enquirySuccessLeadId, setEnquirySuccessLeadId] = useState<string | null>(null);

  const stale = content ? isContentStale(content, currentItemUpdatedAt) : false;

  if (!canUseMarketing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Marketing</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            AI-assisted marketing content and channel distribution aren&apos;t available on your current plan.
          </p>
        </CardContent>
      </Card>
    );
  }

  async function handleGenerate() {
    setBusy("generate");
    setError(null);
    const result = await generateMarketingContentAction(itemRef);
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setContent(result.content);
    setEditedCaption(result.content.socialCaption);
    setEditedMessage(result.content.whatsappMessage);
  }

  async function handleSaveEdits() {
    if (!content) return;
    setBusy("save");
    setError(null);
    const result = await updateMarketingContentAction(itemRef, content.id, {
      socialCaption: editedCaption,
      whatsappMessage: editedMessage,
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setContent(result.content);
  }

  async function handleSimulatePublish(channel: MarketingChannel) {
    if (!content) return;
    setBusy(`simulate-${channel}`);
    setError(null);
    const result = await simulatePublishAction(itemRef, content.id, channel);
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setPublications((prev) => [result.publication, ...prev]);
  }

  async function handlePublish(channel: MarketingChannel) {
    if (!content) return;
    setBusy(`publish-${channel}`);
    setError(null);
    const result = await publishContentAction(itemRef, content.id, channel);
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setPublications((prev) => [result.publication, ...prev]);
  }

  async function handleSimulateEnquiry(channel: MarketingChannel) {
    setBusy("enquiry");
    setError(null);
    const result = await simulateChannelEnquiryAction(itemRef, channel, enquiryForm);
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setEnquirySuccessLeadId(result.lead.id);
    setEnquiryChannel(null);
    setEnquiryForm({ customerName: "", customerPhone: "", message: "" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Marketing</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {!content ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Generate a social caption and WhatsApp message grounded in this item&apos;s actual price, availability, and
              description.
            </p>
            <Button onClick={handleGenerate} disabled={busy === "generate"} className="w-fit">
              {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate marketing content
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={content.generationMethod === "ai" ? "intelligence" : "default"}>
                {content.generationMethod === "ai" ? "AI-generated" : "Template-generated"}
              </Badge>
              {stale ? <Badge variant="warning">Item changed since this was generated</Badge> : null}
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={busy === "generate"}>
                {busy === "generate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Regenerate
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="social-caption">Social caption</Label>
              <Textarea id="social-caption" rows={4} value={editedCaption} onChange={(e) => setEditedCaption(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="whatsapp-message">WhatsApp message</Label>
              <Textarea id="whatsapp-message" rows={4} value={editedMessage} onChange={(e) => setEditedMessage(e.target.value)} />
            </div>
            <Button variant="outline" onClick={handleSaveEdits} disabled={busy === "save"} className="w-fit">
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save edits
            </Button>

            <div className="flex flex-col gap-3 border-t border-border pt-4">
              {MARKETING_CHANNELS.map((channel) => (
                <div key={channel} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{CHANNEL_LABEL[channel]}</p>
                    <p className="text-xs text-muted-foreground">{CONNECTION_STATUS_LABEL[channelStatuses[channel]]}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={channelStatuses[channel] !== "connected" || busy === `publish-${channel}`}
                      onClick={() => handlePublish(channel)}
                      title={channelStatuses[channel] !== "connected" ? "Connect this channel to publish for real." : undefined}
                    >
                      {busy === `publish-${channel}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Publish
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === `simulate-${channel}`}
                      onClick={() => handleSimulatePublish(channel)}
                    >
                      {busy === `simulate-${channel}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Simulate publish (demo)
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEnquiryChannel(channel)}>
                      Simulate customer enquiry (demo)
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {publications.length > 0 ? (
              <div className="flex flex-col gap-1.5 border-t border-border pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Publish history</p>
                <ul className="flex flex-col gap-1 text-sm">
                  {publications.map((publication) => (
                    <li key={publication.id} className="flex items-center gap-2">
                      <Badge
                        variant={
                          publication.status === "published" ? "success" : publication.status === "failed" ? "destructive" : "warning"
                        }
                      >
                        {publication.isSimulated ? "Simulated" : publication.status === "published" ? "Published" : "Failed"}
                      </Badge>
                      <span className="text-muted-foreground">
                        {CHANNEL_LABEL[publication.channel]}
                        {publication.errorMessage ? ` — ${publication.errorMessage}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        {enquiryChannel ? (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <p className="text-sm font-medium text-foreground">
              Simulate a customer enquiry from {CHANNEL_LABEL[enquiryChannel]} (demo)
            </p>
            <p className="text-xs text-muted-foreground">
              This creates a real lead in Atlas, attributed to this channel — for demonstrating the journey when no real
              inbound message is available.
            </p>
            <Input
              placeholder="Customer name"
              value={enquiryForm.customerName}
              onChange={(e) => setEnquiryForm((f) => ({ ...f, customerName: e.target.value }))}
            />
            <Input
              placeholder="Customer phone"
              value={enquiryForm.customerPhone}
              onChange={(e) => setEnquiryForm((f) => ({ ...f, customerPhone: e.target.value }))}
            />
            <Textarea
              placeholder="Message (optional)"
              rows={2}
              value={enquiryForm.message}
              onChange={(e) => setEnquiryForm((f) => ({ ...f, message: e.target.value }))}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleSimulateEnquiry(enquiryChannel)} disabled={busy === "enquiry"}>
                {busy === "enquiry" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Create simulated lead
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEnquiryChannel(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {enquirySuccessLeadId ? (
          <p className="text-sm text-success">
            Lead created. <a href={`/app/leads/${enquirySuccessLeadId}`} className="underline">View it</a>.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
