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
      <p className="provisioning-warning">
        This may take a minute. Don&apos;t refresh or close this page while your site is being
        created.
      </p>
      <p>{provisionStep}</p>
    </section>
  );
}
