import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { saveAssistantSettingsAction } from "@/features/assistant/actions/assistant-actions";
import { getAssistantService } from "@/features/assistant/service/assistant-service";

export const metadata = { title: "Assistant settings" };

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default async function AssistantSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const { business } = await requireCurrentSession();
  const settings = await getAssistantService(business.id).getSettings();

  return (
    <form action={saveAssistantSettingsAction} className="flex max-w-3xl flex-col gap-6">
      {saved ? (
        <p role="status" className="rounded-md border border-success/25 bg-success/10 px-3 py-2 text-sm text-success">
          Settings saved.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assistant</CardTitle>
          <CardDescription>Turn the assistant on or off for customers.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex items-center gap-2.5 text-sm font-medium text-foreground">
            <input type="checkbox" name="assistantEnabled" defaultChecked={settings.assistantEnabled} className="h-4 w-4 accent-[var(--primary)]" />
            Assistant enabled
          </label>
          <Field id="tone" label="Tone">
            <Select id="tone" name="tone" defaultValue={settings.tone}>
              <option value="friendly">Friendly</option>
              <option value="formal">Formal</option>
            </Select>
          </Field>
          <Field id="greeting" label="Greeting" hint="The first message customers see. Leave empty for the default.">
            <Textarea id="greeting" name="greeting" rows={2} maxLength={300} defaultValue={settings.greeting ?? ""} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business information</CardTitle>
          <CardDescription>
            The assistant may state <strong className="font-semibold text-foreground">only</strong> these facts (plus your live inventory). Anything not
            covered here, it says it will check with your team — it never guesses delivery, discounts or warranties.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field id="displayName" label="Display name" hint="Defaults to your business name.">
            <Input id="displayName" name="displayName" maxLength={100} defaultValue={settings.displayName ?? ""} />
          </Field>
          <Field id="openingHours" label="Opening hours">
            <Input id="openingHours" name="openingHours" maxLength={300} defaultValue={settings.openingHours ?? ""} placeholder="Mon–Sat 9am–6pm" />
          </Field>
          <Field id="location" label="Location">
            <Input id="location" name="location" maxLength={300} defaultValue={settings.location ?? ""} />
          </Field>
          <Field id="deliveryPolicy" label="Delivery policy">
            <Textarea id="deliveryPolicy" name="deliveryPolicy" rows={3} maxLength={600} defaultValue={settings.deliveryPolicy ?? ""} />
          </Field>
          <Field id="paymentMethods" label="Payment methods">
            <Input id="paymentMethods" name="paymentMethods" maxLength={300} defaultValue={settings.paymentMethods ?? ""} placeholder="M-Pesa, bank transfer, cash" />
          </Field>
          <Field id="handoffTopics" label="Topics to hand to the team" hint="For example: custom orders, bulk purchases, complaints.">
            <Input id="handoffTopics" name="handoffTopics" maxLength={300} defaultValue={settings.handoffTopics ?? ""} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">WhatsApp</CardTitle>
          <CardDescription>
            Connects incoming WhatsApp Business messages to this business. Enter the <em>Phone number ID</em> from your Meta developer dashboard (not the
            phone number itself). Requires the server settings described in the setup notes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field id="whatsappPhoneNumberId" label="WhatsApp phone number ID">
            <Input id="whatsappPhoneNumberId" name="whatsappPhoneNumberId" maxLength={60} defaultValue={settings.whatsappPhoneNumberId ?? ""} />
          </Field>
        </CardContent>
      </Card>

      <div>
        <Button type="submit">Save settings</Button>
      </div>
    </form>
  );
}
