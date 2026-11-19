import "server-only";
import { render } from "@react-email/components";
import { createElement } from "react";
import { appUrl } from "../env";
import { NoticeEmail, type NoticeEmailProps } from "./templates/notice";

export type NoticeContent = Omit<NoticeEmailProps, "logoUrl" | "appUrl">;

export async function renderNotice(content: NoticeContent): Promise<{ html: string; text: string }> {
  const props: NoticeEmailProps = { ...content, logoUrl: appUrl("/brand/inhub-ecell-email.png"), appUrl: appUrl("/").replace(/\/$/, "") };
  const element = createElement(NoticeEmail, props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}
