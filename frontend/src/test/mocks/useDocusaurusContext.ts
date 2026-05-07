// Mock for @docusaurus/useDocusaurusContext used in tests
const useDocusaurusContext = () => ({
  siteConfig: {
    title: "Copisaurus",
    customFields: {
      backendUrl: "http://localhost:8000",
      gitProvider: "gitlab",
      gitRepoUrl: "http://gitlab.example.com/group/repo",
      gitDefaultBranch: "master",
    },
  },
});

export default useDocusaurusContext;
