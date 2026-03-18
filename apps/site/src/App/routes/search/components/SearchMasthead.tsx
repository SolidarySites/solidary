type SearchMastheadProps = {
  totalNodeCount: number;
  totalConnectionCount: number;
  resultCount: number;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
};

const formatNodeCount = (count: number) => `${count} result${count === 1 ? "" : "s"}`;
const formatConnectionCount = (count: number) =>
  `${count} connection${count === 1 ? "" : "s"}`;

export function SearchMasthead({
  totalNodeCount,
  totalConnectionCount,
  resultCount,
  searchQuery,
  onSearchQueryChange
}: SearchMastheadProps) {
  const trimmedQuery = searchQuery.trim();
  const resultsLabel = trimmedQuery
    ? `${formatNodeCount(resultCount)} matched`
    : `${formatNodeCount(resultCount)} indexed`;

  return (
    <section className="search-masthead" aria-labelledby="search-route-title">
      <div className="search-masthead-copy">
        <h1 id="search-route-title" className="search-masthead-title">
          Search the public index
        </h1>
        <p className="search-masthead-lead">
          Find published sites and indexes by title, description, or URL across the public
          Solidary network.
        </p>
        <label className="search-query-field">
          <span className="search-query-label">Search published sites and indexes</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Title, description, or canonical URL"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </div>

      <div className="search-masthead-support">
        <p className="search-masthead-support-copy">
          Solidary network
        </p>
        <dl className="search-masthead-stats">
          <div>
            <dt>Index</dt>
            <dd>{formatNodeCount(totalNodeCount)}</dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>{formatConnectionCount(totalConnectionCount)}</dd>
          </div>
          <div>
            <dt>Showing</dt>
            <dd>{resultsLabel}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
