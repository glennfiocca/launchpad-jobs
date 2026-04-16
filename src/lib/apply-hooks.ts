import { sendApplicationConfirmation } from "@/lib/email";

export async function sendApplyConfirmation({
  userEmail,
  userName,
  jobTitle,
  companyName,
  appUrl,
}: {
  userEmail: string;
  userName: string;
  jobTitle: string;
  companyName: string;
  appUrl: string;
}) {
  await sendApplicationConfirmation({
    to: userEmail,
    userName,
    jobTitle,
    companyName,
    dashboardUrl: appUrl,
  }).catch((err) => {
    console.error("Failed to send application confirmation:", err);
  });
}
