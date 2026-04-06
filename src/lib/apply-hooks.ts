import { sendApplicationConfirmation } from "@/lib/email";

export async function sendApplyConfirmation({
  userEmail,
  userName,
  jobTitle,
  companyName,
  trackingEmail,
  appUrl,
}: {
  userEmail: string;
  userName: string;
  jobTitle: string;
  companyName: string;
  trackingEmail: string;
  appUrl: string;
}) {
  await sendApplicationConfirmation({
    to: userEmail,
    userName,
    jobTitle,
    companyName,
    trackingEmail,
    dashboardUrl: appUrl,
  }).catch((err) => {
    console.error("Failed to send application confirmation:", err);
  });
}
