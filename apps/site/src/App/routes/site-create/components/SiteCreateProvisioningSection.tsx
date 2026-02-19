type SiteCreateProvisioningSectionProps = {
  provisionStep: string;
};

export default function SiteCreateProvisioningSection({
  provisionStep
}: SiteCreateProvisioningSectionProps) {
  return (
    <section className="provisioning">
      <div className="spinner" />
      <h2>Setting up your site</h2>
      <p>{provisionStep}</p>
    </section>
  );
}
