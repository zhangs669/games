const apiBase = "";
const markedAvailable = typeof window !== "undefined" && window.marked;
if (markedAvailable) {
    window.marked.setOptions({
        mangle: false,
        headerIds: false,
    });
}
const domPurifyAvailable = typeof window !== "undefined" && window.DOMPurify;
const renderMarkdown = (element, markdown, fallback = "") => {
    if (!element) return;
    if (!markdown) {
        element.textContent = fallback;
        return;
    }
    if (markedAvailable && domPurifyAvailable) {
        const html = window.marked.parse(markdown);
        element.innerHTML = window.DOMPurify.sanitize(html);
        return;
    }
    element.textContent = markdown;
};
let currentFeeds = [];
const feedList = document.querySelector("#feed-list");
const episodeList = document.querySelector("#episode-list");
const feedForm = document.querySelector("#feed-form");
const toast = document.querySelector("#toast");
const filterSelect = document.querySelector("#episode-filter");
const heroCount = document.querySelector("#hero-feed-count");
const topbarFeedCount = document.querySelector("#topbar-feed-count");
const topbarEpisodeCount = document.querySelector("#topbar-episode-count");
const addPanel = document.querySelector("#add-panel");
const addPanelTriggers = document.querySelectorAll("[data-action='open-add-panel']");
const refreshAllButtons = document.querySelectorAll("[data-action='refresh-feeds']");
const closeAddPanelBtn = document.querySelector("#close-add-panel");
const themeToggleBtn = document.querySelector("#toggle-theme");
const dashboardTabs = document.querySelectorAll("[data-tab-target]");
const tabContents = document.querySelectorAll("[data-tab-content]");
const sidebarNavItems = document.querySelectorAll(".sidebar-nav-item");

const THEME_STORAGE_KEY = "rss_studio_theme";
const COLLAPSE_CHAR_THRESHOLD = 180;

const getFeedHomepage = (feedId) => {
    if (!feedId) return null;
    const feed = currentFeeds.find((item) => item.id === feedId);
    return feed?.link || feed?.url || null;
};

const getFeedDisplayName = (feedId) => {
    if (!feedId) return "未知来源";
    const feed = currentFeeds.find((item) => item.id === feedId);
    return feed?.title || feed?.url || "未知来源";
};

const attachDescriptionToggle = (card) => {
    if (!card) return;
    const desc = card.querySelector(".card-desc");
    if (!desc) return;
    const text = desc.textContent?.trim() ?? "";
    if (text.length <= COLLAPSE_CHAR_THRESHOLD) return;

    desc.classList.add("card-desc--collapsible");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "card-toggle";
    toggle.textContent = "展开";
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", () => {
        const expanded = desc.classList.toggle("card-desc--expanded");
        toggle.textContent = expanded ? "收起" : "展开";
        toggle.setAttribute("aria-expanded", String(expanded));
    });
    desc.insertAdjacentElement("afterend", toggle);
};

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
        renderMarkdown(
            clone.querySelector(".card-desc"),
            feed.description,
            feed.url
        );
        clone.querySelector(".card-meta").textContent = `最新更新：${
            feed.last_checked
                ? new Date(feed.last_checked).toLocaleString()
                : "未抓取"
        }`;
        attachDescriptionToggle(card);

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

    if (!episodes.length) {
        episodeList.innerHTML = '<p class="empty">暂无节目内容。</p>';
        return;
    }

    const template = document.querySelector("#episode-card-template");
    episodes.forEach((episode) => {
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector(".card");
        clone.querySelector(".card-title").textContent =
            episode.title || "未命名节目";
        const source = card.querySelector(".card-source");
        if (source) {
            source.textContent = `来源：${getFeedDisplayName(episode.feed_id)}`;
        }
        renderMarkdown(
            clone.querySelector(".card-desc"),
            episode.summary || episode.description,
            "暂无简介"
        );
        attachDescriptionToggle(card);
        const publishedDate = episode.published
            ? new Date(episode.published)
            : new Date();
        clone.querySelector(".card-meta").textContent =
            publishedDate.toLocaleString();
        const link = clone.querySelector("a");
        link.href = episode.link || getFeedHomepage(episode.feed_id) || "#";
        link.textContent = "打开原文";
        link.title = "在新标签打开原网页";
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

const activateDashboardTab = (target) => {
    tabContents.forEach((content) => {
        const isActive = content.dataset.tabContent === target;
        content.classList.toggle("active", isActive);
        if (isActive) {
            content.removeAttribute("hidden");
        } else {
            content.setAttribute("hidden", "true");
        }
    });
    dashboardTabs.forEach((tab) => {
        const isActive = tab.dataset.tabTarget === target;
        tab.classList.toggle("active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
    });
};

const initDashboardTabs = () => {
    if (!dashboardTabs.length) return;
    dashboardTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            if (tab.classList.contains("active")) return;
            activateDashboardTab(tab.dataset.tabTarget);
        });
    });
    activateDashboardTab("feeds");
};

const init = async () => {
    await loadFeeds();
    await loadEpisodes();
};

const initSidebarNav = () => {
    sidebarNavItems.forEach((item) => {
        item.addEventListener("click", (e) => {
            const href = item.getAttribute("href");
            const navTarget = item.getAttribute("data-nav-target");
            
            if (href && href.startsWith("#")) {
                e.preventDefault();
                const targetId = href.substring(1);
                const targetElement = document.getElementById(targetId);
                
                if (targetElement) {
                    // 如果是订阅表单面板
                    if (targetId === "add-panel") {
                        addPanel.classList.add("open");
                        targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
                    } 
                    // 如果是仪表盘面板，需要切换标签页
                    else if (targetId === "dashboard-panel" && navTarget) {
                        activateDashboardTab(navTarget);
                        targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
                    } 
                    // 其他情况直接滚动
                    else {
                        targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                    
                    // 更新活动状态
                    sidebarNavItems.forEach((navItem) => navItem.classList.remove("active"));
                    item.classList.add("active");
                }
            }
        });
    });
};

initThemeControls();
initDashboardTabs();
initSidebarNav();
init();


