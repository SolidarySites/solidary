type ProvisioningSectionProps = {
  step: string;
};

export default function ProvisioningSection({ step }: ProvisioningSectionProps) {
  return (
    <section className="provisioning">
      <div className="spinner" />
      <h2>Setting up your site</h2>
      <p>{step}</p>
    </section>
  );
}
