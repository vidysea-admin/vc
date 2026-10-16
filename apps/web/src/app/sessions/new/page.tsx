import { cookies } from "next/headers";
import { normalizeUiLocale, UI_LOCALE_COOKIE } from "../../../components/labels";
import { NewSessionForm } from "../../../components/NewSessionForm";

export const dynamic = "force-dynamic";

/** T-021: the "start a new session" demo screen (see components/NewSessionForm.tsx). */
export default async function NewSessionPage() {
  const locale = normalizeUiLocale((await cookies()).get(UI_LOCALE_COOKIE)?.value);
  return <NewSessionForm initialLocale={locale} />;
}
