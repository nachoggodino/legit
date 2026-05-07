import React, { useState } from "react";
import OriginalNavbar from "@theme-original/Navbar";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import AiSearchBar from "@site/src/components/AiSearchBar";
import EditFab from "@site/src/components/EditFab";
import EditModal from "@site/src/components/EditModal";
import { useLocation } from "react-router-dom";
import styles from "./Navbar.module.css";

/** GitLab logo mark */
function GitLabIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 380 380"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M282.83 170.73L190 4.69 97.17 170.73 4.34 336.77 190 375.31l185.66-38.54L282.83 170.73z" />
    </svg>
  );
}

/** GitHub Octocat icon (simplified) */
function GitHubIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.1 3.3 9.43 7.87 10.97.58.1.79-.25.79-.56v-2c-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18.92-.26 1.9-.39 2.88-.39.98 0 1.96.13 2.88.39 2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.8 1.18 1.83 1.18 3.09 0 4.43-2.7 5.4-5.27 5.69.41.36.78 1.07.78 2.15v3.19c0 .31.21.67.8.56C20.2 21.43 23.5 17.1 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

/**
 * Swizzled Docusaurus Navbar.
 *
 * Renders the original navbar items (logo, sidebar toggle, dark-mode toggle)
 * and injects:
 *  - AiSearchBar in the right area
 *  - Git provider link (GitLab / GitHub)
 *  - EditFab (FAB) + EditModal at page level
 */
export default function Navbar(props) {
  const { siteConfig } = useDocusaurusContext();
  const { gitProvider, gitRepoUrl, gitDefaultBranch } =
    siteConfig.customFields ?? {};

  const location = useLocation();
  // Derive the current file path from the URL pathname.
  // Docusaurus serves docs at "/" (routeBasePath "/") so we strip the leading
  // slash and append ".md".
  const rawPath = location.pathname.replace(/^\//, "").replace(/\/$/, "");
  const filePath = rawPath ? `docs/${rawPath}.md` : "docs/intro.md";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  return (
    <>
      {/* Original Docusaurus navbar (logo, sidebar toggle, color-mode toggle) */}
      <OriginalNavbar {...props} />

      {/* Custom navbar additions — injected via a fixed overlay */}
      <div className={styles.navbarAddons}>
        {/* AiSearchBar */}
        <div className={styles.navbarAddonItem}>
          <AiSearchBar />
        </div>

        {/* Git provider link */}
        {gitRepoUrl && (
          <a
            href={gitRepoUrl}
            target="_blank"
            rel="noreferrer"
            title={`Open ${gitProvider} repository`}
            aria-label={`Open ${gitProvider} repository`}
            className={styles.repoLink}
          >
            {gitProvider === "github" ? <GitHubIcon /> : <GitLabIcon />}
            <span className={styles.repoLinkLabel}>{gitProvider}</span>
          </a>
        )}
      </div>

      {/* EditFab — always visible, fixed to bottom-right */}
      <EditFab
        isLoading={isEditing}
        isModalOpen={isModalOpen}
        onToggle={() => setIsModalOpen((prev) => !prev)}
      />

      {/* EditModal */}
      <EditModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        filePath={filePath}
        defaultBranch={String(gitDefaultBranch ?? "master")}
        onEditingChange={setIsEditing}
      />
    </>
  );
}
