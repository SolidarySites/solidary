type IndexCreateProvisioningSectionProps = {
  provisionStep: string;
};

export default function IndexCreateProvisioningSection({
  provisionStep
}: IndexCreateProvisioningSectionProps) {
  return (
    <section className="provisioning">
      <div className="spinner" />
      <h2>Setting up your index</h2>
      <p className="provisioning-warning">
        This may take a couple of minutes. Don&apos;t refresh or close this page while your index
        infrastructure is being created.
      </p>
      <p>{provisionStep}</p>
    </section>
  );
}
