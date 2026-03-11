import PublicInfoPage from "../../components/PublicInfoPage";

const sections = [
  {
    title: "Why support it",
    paragraphs: [
      "Solidary is building publishing infrastructure for independently owned static websites and the public index that helps people discover them.",
      "Support goes toward keeping that tooling usable, maintaining the shared index, and making it easier for more sites to publish without giving up control of their work."
    ],
    action: {
      href: "/contact",
      label: "Contact About Support"
    }
  },
  {
    title: "What this route does today",
    paragraphs: [
      "This page establishes a dedicated place for project support inside the public site.",
      "Direct payment mechanics are not published in the app yet, so the current path is to get in touch and arrange support directly."
    ],
    action: {
      href: "https://github.com/SolidarySites/solidary",
      label: "Open Repository",
      external: true
    }
  }
] as const;

export default function SupportRoute() {
  return (
    <PublicInfoPage
      title="Support"
      lead="Support Solidary if you want independently published static sites to have shared public infrastructure without centralized ownership."
      note="This route is the support page for the public site. It explains what support enables now, even before a direct payment flow is added."
      sections={sections}
    />
  );
}
