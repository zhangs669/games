const apiBase = "";
let currentFeeds = [];
const feedList = document.querySelector("#feed-list");
const episodeList = document.querySelector("#episode-list");
const feedForm = document.querySelector("#feed-form");
const toast = document.querySelector("#toast");
const filterSelect = document.querySelector("#episode-filter");
const heroCount = document.querySelector("#hero-feed-count");
const topbarFeedCount = document.querySelector("#topbar-feed-count");
const topbarEpisodeCount = document.querySelector("#topbar-episode-count");
const sidebarFeedCount = document.querySelector("#sidebar-feed-count");
const sidebarEpisodeCount = document.querySelector("#sidebar-episode-count");
const addPanel = document.querySelector("#add-panel");
const addPanelTriggers = document.querySelectorAll("[data-action='open-add-panel']");
const refreshAllButtons = document.querySelectorAll("[data-action='refresh-feeds']");
const closeAddPanelBtn = document.querySelector("#close-add-panel");
const themeToggleBtn = document.querySelector("#toggle-theme");

const THEME_STORAGE_KEY = "rss_studio_theme";

const applyTheme = (theme) => {
    const isDark = theme === "dark";
    document.body.classList.toggle("theme-dark", isDark);
    if (themeToggleBtn) {
        themeToggleBtn.textContent = isDark ? "亮色模式" : "暗黑模式";
        themeToggleBtn.setAttribute(
            "aria-label",
            isDark ? "切换至亮色模式" : "切换至暗黑模式"
        );
        themeToggleBtn.setAttribute("aria-pressed", String(isDark));
    }
};

const initThemeControls = () => {
    if (!themeToggleBtn) return;
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)");
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const initialTheme =
        savedTheme || (systemPrefersDark.matches ? "dark" : "light");
    applyTheme(initialTheme);

    themeToggleBtn.addEventListener("click", () => {
        const nextTheme = document.body.classList.contains("theme-dark")
            ? "light"
            : "dark";
        applyTheme(nextTheme);
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    });

    systemPrefersDark.addEventListener("change", (event) => {
        if (localStorage.getItem(THEME_STORAGE_KEY)) return;
        applyTheme(event.matches ? "dark" : "light");
    });
};

const showToast = (message, variant = "default") => {
    toast.textContent = message;
    toast.dataset.variant = variant;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
};

const request = async (path, options = {}) => {
    const res = await fetch(`${apiBase}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "请求失败");
    }
    return res.status === 204 ? null : res.json();
};

const renderFeeds = (feeds) => {
    feedList.innerHTML = "";
    const formattedCount = feeds.length.toString().padStart(2, "0");
    heroCount.textContent = formattedCount;
    if (topbarFeedCount) topbarFeedCount.textContent = formattedCount;
    if (sidebarFeedCount) sidebarFeedCount.textContent = formattedCount;

    filterSelect.innerHTML = `<option value="">全部订阅</option>`;
    currentFeeds = feeds;
    feeds.forEach((feed) => {
        const option = document.createElement("option");
        option.value = feed.id;
        option.textContent = feed.title || feed.url;
        filterSelect.appendChild(option);
    });

    if (!feeds.length) {
        feedList.innerHTML =
            '<p class="empty">暂无订阅，点击“订阅新源”开启旅程。</p>';
        return;
    }

    const template = document.querySelector("#feed-card-template");
    feeds.forEach((feed) => {
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector(".card");
        card.dataset.feedId = feed.id;
        clone.querySelector(".card-title").textContent = feed.title || "未命名订阅";
        clone.querySelector(".card-desc").textContent =
            feed.description || feed.url;
        clone.querySelector(".card-meta").textContent = `最新更新：${
            feed.last_checked
                ? new Date(feed.last_checked).toLocaleString()
                : "未抓取"
        }`;

        const [refreshBtn, deleteBtn] = clone.querySelectorAll(".btn.icon");
        refreshBtn.addEventListener("click", async () => {
            refreshBtn.disabled = true;
            try {
                await request(`/feeds/${feed.id}/refresh`, { method: "POST" });
                showToast("刷新成功");
                await Promise.all([loadFeeds(), loadEpisodes()]);
            } catch (error) {
                showToast(error.message, "danger");
            } finally {
                refreshBtn.disabled = false;
            }
        });

        deleteBtn.addEventListener("click", async () => {
            if (!confirm("确定要删除该订阅吗？")) return;
            deleteBtn.disabled = true;
            try {
                await request(`/feeds/${feed.id}`, { method: "DELETE" });
                showToast("删除成功");
                await Promise.all([loadFeeds(), loadEpisodes()]);
            } catch (error) {
                showToast(error.message, "danger");
            } finally {
                deleteBtn.disabled = false;
            }
        });

        feedList.appendChild(clone);
    });
};

const renderEpisodes = (episodes) => {
    episodeList.innerHTML = "";
    const formattedCount = episodes.length.toString().padStart(2, "0");
    if (topbarEpisodeCount) topbarEpisodeCount.textContent = formattedCount;
    if (sidebarEpisodeCount) sidebarEpisodeCount.textContent = formattedCount;

    if (!episodes.length) {
        episodeList.innerHTML = '<p class="empty">暂无节目内容。</p>';
        return;
    }

    const template = document.querySelector("#episode-card-template");
    episodes.forEach((episode) => {
        const clone = template.content.cloneNode(true);
        clone.querySelector(".card-title").textContent =
            episode.title || "未命名节目";
        clone.querySelector(".card-desc").textContent =
            episode.summary || episode.description || "暂无简介";
        const publishedDate = episode.published
            ? new Date(episode.published)
            : new Date();
        clone.querySelector(".card-meta").textContent =
            publishedDate.toLocaleString();
        const link = clone.querySelector("a");
        link.href = episode.link || "#";
        link.textContent = "立即播放";
        episodeList.appendChild(clone);
    });
};

const loadFeeds = async () => {
    try {
        const feeds = await request("/feeds");
        renderFeeds(feeds);
    } catch (error) {
        showToast(error.message, "danger");
    }
};

const loadEpisodes = async () => {
    try {
        const feedId = filterSelect.value;
        const url = feedId ? `/episodes?feed_id=${feedId}` : `/episodes`;
        const episodes = await request(url);
        renderEpisodes(episodes.slice(0, 20));
    } catch (error) {
        showToast(error.message, "danger");
    }
};

feedForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(feedForm);
    const payload = {
        url: formData.get("url"),
        auto_refresh: formData.get("auto_refresh") === "on",
    };
    feedForm.classList.add("loading");
    try {
        await request("/feeds", {
            method: "POST",
            body: JSON.stringify(payload),
        });
        feedForm.reset();
        addPanel.classList.remove("open");
        showToast("订阅成功");
        await Promise.all([loadFeeds(), loadEpisodes()]);
    } catch (error) {
        showToast(error.message, "danger");
    } finally {
        feedForm.classList.remove("loading");
    }
});

const setRefreshButtonsDisabled = (disabled) => {
    refreshAllButtons.forEach((btn) => {
        btn.disabled = disabled;
    });
};

const handleRefreshAll = async () => {
    if (!refreshAllButtons.length) return;
    if (!currentFeeds.length) {
        showToast("暂无订阅");
        return;
    }
    setRefreshButtonsDisabled(true);
    try {
        await Promise.all(
            currentFeeds.map((feed) =>
                request(`/feeds/${feed.id}/refresh`, { method: "POST" })
            )
        );
        showToast("刷新完成");
        await Promise.all([loadFeeds(), loadEpisodes()]);
    } catch (error) {
        showToast(error.message, "danger");
    } finally {
        setRefreshButtonsDisabled(false);
    }
};

refreshAllButtons.forEach((btn) => {
    btn.addEventListener("click", handleRefreshAll);
});

filterSelect.addEventListener("change", loadEpisodes);

addPanelTriggers.forEach((btn) => {
    btn.addEventListener("click", () => {
        addPanel.classList.add("open");
    });
});

closeAddPanelBtn.addEventListener("click", () => {
    addPanel.classList.remove("open");
});

const init = async () => {
    await loadFeeds();
    await loadEpisodes();
};

initThemeControls();
init();


