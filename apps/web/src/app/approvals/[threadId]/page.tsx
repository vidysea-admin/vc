import { cookies } from "next/headers";
import { normalizeUiLocale, UI_LOCALE_COOKIE } from "../../../components/labels";
import { ApprovalScreen } from "../../../components/ApprovalScreen";

export const dynamic = "force-dynamic";

export default async function ApprovalPage({ params }: { params: Promise<{ threadId: string }> }) {
  const locale = normalizeUiLocale((await cookies()).get(UI_LOCALE_COOKIE)?.value);
  const { threadId } = await params;
  let id = threadId;
  try {
    id = decodeURIComponent(threadId);
  } catch {
    // left as-is; the API refuses a malformed id
  }
  return <ApprovalScreen threadId={id} initialLocale={locale} />;
}
