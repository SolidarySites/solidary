export const normalizeSiteUrl = (value: string) => value.trim().replace(/\/+$/, "");

export const resolveSiteUrlFromRepo = ({
  ownerLogin,
  repoName
}: {
  ownerLogin: string;
  repoName: string;
}) => {
  const pagesRootUrl = `https://${ownerLogin}.github.io`;
  const isUserSite = repoName.toLowerCase() === `${ownerLogin.toLowerCase()}.github.io`;
  const baseUrl = isUserSite ? "" : `/${repoName}`;
  return normalizeSiteUrl(isUserSite ? pagesRootUrl : `${pagesRootUrl}${baseUrl}`);
};
