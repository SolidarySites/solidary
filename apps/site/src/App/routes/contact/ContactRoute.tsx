import PublicInfoPage from "../../components/PublicInfoPage";

const sections = [
  {
    title: "Start with the repository",
    paragraphs: [
      "If you want to reach the project, the clearest public point of contact right now is the Solidary repository.",
      "Use it to follow development, understand the protocol, and start a conversation around publishing, indexes, or implementation."
    ],
    action: {
      href: "https://github.com/SolidarySites/solidary",
      label: "Open Repository",
      external: true
    }
  },
  {
    title: "Support and collaboration",
    paragraphs: [
      "Use this route if you want to talk about supporting the project, contributing to the tooling, or collaborating on public-facing infrastructure.",
      "The support route is separate so funding conversations have a dedicated place inside the site."
    ],
    action: {
      href: "/support",
      label: "View Support Route"
    }
  }
] as const;

export default function ContactRoute() {
  return (
    <PublicInfoPage
      title="Contact"
      lead="Use this page to reach the project around publishing, collaboration, or support."
      note="Contact details are not being published as a private inbox on the homepage. This route keeps contact information deliberate and separate from the public index."
      sections={[...sections]}
    />
  );
}
