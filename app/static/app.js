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
const sidebarFeedsBadge = document.querySelector("#sidebar-feeds-badge");
const sidebarEpisodesBadge = document.querySelector("#sidebar-episodes-badge");

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

const attachDescriptionToggle = (card, episode) => {
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
    toggle.addEventListener("click", (e) => {
        e.stopPropagation(); // 阻止事件冒泡，避免触发卡片的点击事件
        // 如果有episode数据，直接打开阅读器界面；否则保持原来的展开/收起行为
        if (episode) {
            openReader(episode);
        } else {
            const expanded = desc.classList.toggle("card-desc--expanded");
            toggle.textContent = expanded ? "收起" : "展开";
            toggle.setAttribute("aria-expanded", String(expanded));
        }
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

const updateSidebarBadge = (badgeElement, count) => {
    if (!badgeElement) return;
    const currentCount = parseInt(badgeElement.textContent) || 0;
    
    // 如果数量为0，隐藏徽章
    if (count === 0) {
        badgeElement.style.display = "none";
        badgeElement.textContent = "0";
        return;
    }
    
    // 显示徽章并更新数量
    badgeElement.style.display = "inline-flex";
    badgeElement.textContent = count;
    
    // 添加动画效果（仅在数量变化时）
    if (count !== currentCount && currentCount > 0) {
        badgeElement.style.animation = "none";
        // 强制重排以触发动画
        void badgeElement.offsetWidth;
        badgeElement.style.animation = "badge-pulse 0.4s ease";
    }
};

const renderFeeds = (feeds) => {
    feedList.innerHTML = "";
    const formattedCount = feeds.length.toString().padStart(2, "0");
    heroCount.textContent = formattedCount;
    if (topbarFeedCount) topbarFeedCount.textContent = formattedCount;
    
    // 更新侧边栏徽章
    updateSidebarBadge(sidebarFeedsBadge, feeds.length);

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
            '<p class="empty">暂无订阅，点击"订阅新源"开启旅程。</p>';
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
    
    // 更新侧边栏徽章
    updateSidebarBadge(sidebarEpisodesBadge, episodes.length);

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
        attachDescriptionToggle(card, episode);
        const publishedDate = episode.published
            ? new Date(episode.published)
            : new Date();
        clone.querySelector(".card-meta").textContent =
            publishedDate.toLocaleString();
        const link = clone.querySelector("a");
        link.href = episode.link || getFeedHomepage(episode.feed_id) || "#";
        link.textContent = "打开原文";
        link.title = "在新标签打开原网页";
        
        // 添加点击事件：根据是否有audio_url判断是播客还是RSS
        card.style.cursor = "pointer";
        card.addEventListener("click", (e) => {
            // 如果点击的是链接按钮，不处理
            if (e.target.closest("a")) return;
            
            if (episode.audio_url) {
                // 播客：打开播放器
                openPlayer(episode);
            } else {
                // RSS：打开阅读器
                openReader(episode);
            }
        });
        
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

// 阅读器功能
const readerModal = document.querySelector("#reader-modal");
const readerTitle = document.querySelector("#reader-title");
const readerSource = document.querySelector(".reader-source");
const readerDate = document.querySelector(".reader-date");
const readerReadingTime = document.querySelector(".reader-reading-time");
const readerArticle = document.querySelector("#reader-article");
const readerOriginalLink = document.querySelector("#reader-original-link");
const readerCloseBtn = readerModal?.querySelector(".modal-close");
const readerOverlay = readerModal?.querySelector(".modal-overlay");

// 阅读器设置（存储在 localStorage）
let readerSettings = {
    fontSize: 16,
    theme: "dark",
    fontFamily: "serif",
    width: "medium"
};

// 从 localStorage 加载设置
const loadReaderSettings = () => {
    const saved = localStorage.getItem("readerSettings");
    if (saved) {
        try {
            readerSettings = { ...readerSettings, ...JSON.parse(saved) };
        } catch (e) {
            console.warn("无法加载阅读器设置:", e);
        }
    }
};

// 保存设置到 localStorage
const saveReaderSettings = () => {
    localStorage.setItem("readerSettings", JSON.stringify(readerSettings));
};

// 应用阅读器设置
const applyReaderSettings = () => {
    const article = readerArticle;
    if (!article) return;
    
    // 字体大小
    article.style.fontSize = `${readerSettings.fontSize}px`;
    const fontSizeDisplay = document.querySelector("#reader-font-size-display");
    if (fontSizeDisplay) {
        fontSizeDisplay.textContent = `${readerSettings.fontSize}px`;
    }
    
    // 主题 - 移除所有主题类，然后添加当前主题
    if (readerModal) {
        readerModal.className = readerModal.className.replace(/reader-theme-\w+/g, "");
        readerModal.classList.add(`reader-theme-${readerSettings.theme}`);
    }
    document.querySelectorAll(".reader-control-btn[data-theme]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.theme === readerSettings.theme);
    });
    
    // 字体 - 移除所有字体类，然后添加当前字体
    article.className = article.className.replace(/reader-font-\w+/g, "");
    article.classList.add(`reader-font-${readerSettings.fontFamily}`);
    document.querySelectorAll(".reader-control-btn[data-font]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.font === readerSettings.fontFamily);
    });
    
    // 行宽 - 移除所有行宽类，然后添加当前行宽
    article.className = article.className.replace(/reader-width-\w+/g, "");
    article.classList.add(`reader-width-${readerSettings.width}`);
    document.querySelectorAll(".reader-control-btn[data-width]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.width === readerSettings.width);
    });
};

// 计算阅读时间（基于中文字符数，假设每分钟阅读300字）
const calculateReadingTime = (text) => {
    if (!text) return 0;
    // 移除HTML标签
    const plainText = text.replace(/<[^>]*>/g, "");
    // 计算中文字符数（包括标点）
    const chineseChars = (plainText.match(/[\u4e00-\u9fa5]/g) || []).length;
    // 计算英文单词数
    const englishWords = (plainText.match(/[a-zA-Z]+/g) || []).length;
    // 估算：中文字符按1字计算，英文单词按0.5字计算
    const totalWords = chineseChars + englishWords * 0.5;
    // 每分钟300字
    const minutes = Math.ceil(totalWords / 300);
    return minutes;
};

const openReader = async (episode) => {
    if (!readerModal) return;
    
    // 加载并应用设置
    loadReaderSettings();
    
    // 设置基本信息
    readerTitle.textContent = episode.title || "未命名文章";
    const sourceName = getFeedDisplayName(episode.feed_id);
    readerSource.textContent = `来源：${sourceName}`;
    readerDate.textContent = episode.published 
        ? new Date(episode.published).toLocaleString() 
        : "";
    readerOriginalLink.href = episode.link || getFeedHomepage(episode.feed_id) || "#";
    readerReadingTime.textContent = ""; // 稍后更新
    
    // 显示模态框
    readerModal.classList.add("open");
    readerModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    
    // 应用阅读器设置
    applyReaderSettings();
    
    // 显示加载状态
    readerArticle.innerHTML = '<div class="reader-loading">正在加载文章内容...</div>';
    
    // 渲染文章内容
    try {
        let content = "";
        
        // 优先从后端API获取全文
        if (episode.id) {
            try {
                const response = await request(`/episodes/${episode.id}/full-content`);
                if (response && response.content) {
                    content = response.content;
                }
            } catch (error) {
                console.warn("无法从API获取全文:", error);
            }
        }
        
        // 如果API失败，回退到摘要
        if (!content && episode.summary) {
            content = episode.summary;
        }
        
        // 渲染内容
        if (content) {
            if (markedAvailable && domPurifyAvailable) {
                const html = window.marked.parse(content);
                const sanitized = window.DOMPurify.sanitize(html);
                readerArticle.innerHTML = sanitized;
                
                // 处理图片：将相对路径转换为绝对路径
                const images = readerArticle.querySelectorAll("img");
                images.forEach(img => {
                    if (img.src && !img.src.startsWith("http")) {
                        // 如果是相对路径，尝试基于原文链接解析
                        if (episode.link) {
                            try {
                                const baseUrl = new URL(episode.link);
                                img.src = new URL(img.src, baseUrl).href;
                            } catch (e) {
                                // 如果解析失败，保持原样
                            }
                        }
                    }
                });
            } else {
                readerArticle.textContent = content;
            }
            
            // 计算并显示阅读时间
            const readingTime = calculateReadingTime(content);
            if (readingTime > 0) {
                readerReadingTime.textContent = `约 ${readingTime} 分钟阅读`;
            }
        } else {
            readerArticle.innerHTML = '<p class="empty">暂无内容，请点击"查看原文"查看完整文章</p>';
        }
        
        // 重新应用设置（因为innerHTML会重置样式）
        applyReaderSettings();
    } catch (error) {
        console.error("加载文章失败:", error);
        readerArticle.innerHTML = '<p class="empty">加载失败，请尝试查看原文</p>';
    }
};

const closeReader = () => {
    if (!readerModal) return;
    readerModal.classList.remove("open");
    readerModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
};

if (readerCloseBtn) {
    readerCloseBtn.addEventListener("click", closeReader);
}
if (readerOverlay) {
    readerOverlay.addEventListener("click", closeReader);
}

// 阅读器控制栏事件监听
const initReaderControls = () => {
    // 字体大小控制
    const fontDecrease = document.querySelector("#reader-font-decrease");
    const fontIncrease = document.querySelector("#reader-font-increase");
    
    if (fontDecrease) {
        fontDecrease.addEventListener("click", () => {
            readerSettings.fontSize = Math.max(12, readerSettings.fontSize - 2);
            saveReaderSettings();
            applyReaderSettings();
        });
    }
    
    if (fontIncrease) {
        fontIncrease.addEventListener("click", () => {
            readerSettings.fontSize = Math.min(24, readerSettings.fontSize + 2);
            saveReaderSettings();
            applyReaderSettings();
        });
    }
    
    // 主题切换
    document.querySelectorAll(".reader-control-btn[data-theme]").forEach(btn => {
        btn.addEventListener("click", () => {
            readerSettings.theme = btn.dataset.theme;
            saveReaderSettings();
            applyReaderSettings();
        });
    });
    
    // 字体切换
    document.querySelectorAll(".reader-control-btn[data-font]").forEach(btn => {
        btn.addEventListener("click", () => {
            readerSettings.fontFamily = btn.dataset.font;
            saveReaderSettings();
            applyReaderSettings();
        });
    });
    
    // 行宽切换
    document.querySelectorAll(".reader-control-btn[data-width]").forEach(btn => {
        btn.addEventListener("click", () => {
            readerSettings.width = btn.dataset.width;
            saveReaderSettings();
            applyReaderSettings();
        });
    });
};

// 初始化控制栏
initReaderControls();

// 音频播放器功能
const playerModal = document.querySelector("#player-modal");
const playerTitle = document.querySelector("#player-title");
const playerSource = document.querySelector(".player-source");
const playerDuration = document.querySelector(".player-duration");
const playerDescription = document.querySelector("#player-description");
const audioPlayer = document.querySelector("#audio-player");
const playPauseBtn = document.querySelector("#play-pause-btn");
const progressBar = document.querySelector("#progress-bar");
const volumeBar = document.querySelector("#volume-bar");
const muteBtn = document.querySelector("#mute-btn");
const currentTimeEl = document.querySelector("#current-time");
const totalTimeEl = document.querySelector("#total-time");
const playerCloseBtn = playerModal?.querySelector(".modal-close");
const playerOverlay = playerModal?.querySelector(".modal-overlay");

let currentEpisode = null;

const formatTime = (seconds) => {
    if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const updatePlayPauseIcon = (isPlaying) => {
    if (!playPauseBtn) return;
    const svg = playPauseBtn.querySelector("svg");
    if (!svg) return;
    
    if (isPlaying) {
        // 暂停图标
        svg.innerHTML = '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>';
    } else {
        // 播放图标
        svg.innerHTML = '<path d="M8 5v14l11-7z"/>';
    }
};

const updateVolumeIcon = (isMuted, volume) => {
    if (!muteBtn) return;
    const svg = muteBtn.querySelector("svg");
    if (!svg) return;
    
    if (isMuted || volume === 0) {
        // 静音图标
        svg.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    } else if (volume < 0.5) {
        // 低音量图标
        svg.innerHTML = '<path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>';
    } else {
        // 正常音量图标
        svg.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    }
};

const openPlayer = (episode) => {
    if (!playerModal || !audioPlayer) return;
    
    currentEpisode = episode;
    
    // 设置基本信息
    playerTitle.textContent = episode.title || "未命名播客";
    playerSource.textContent = `来源：${getFeedDisplayName(episode.feed_id)}`;
    playerDuration.textContent = episode.duration ? `时长：${episode.duration}` : "";
    
    // 设置描述
    if (episode.summary) {
        renderMarkdown(playerDescription, episode.summary, "");
    } else {
        playerDescription.innerHTML = "";
    }
    
    // 设置音频源
    audioPlayer.src = episode.audio_url;
    audioPlayer.load();
    
    // 重置UI
    progressBar.value = 0;
    currentTimeEl.textContent = "0:00";
    totalTimeEl.textContent = "0:00";
    updatePlayPauseIcon(false);
    
    // 显示模态框
    playerModal.classList.add("open");
    playerModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    
    // 加载元数据后更新总时长
    audioPlayer.addEventListener("loadedmetadata", () => {
        totalTimeEl.textContent = formatTime(audioPlayer.duration);
    }, { once: true });
};

const closePlayer = () => {
    if (!playerModal || !audioPlayer) return;
    
    // 停止播放
    audioPlayer.pause();
    audioPlayer.src = "";
    currentEpisode = null;
    
    // 关闭模态框
    playerModal.classList.remove("open");
    playerModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
};

// 播放/暂停控制
if (playPauseBtn && audioPlayer) {
    playPauseBtn.addEventListener("click", () => {
        if (audioPlayer.paused) {
            audioPlayer.play();
            updatePlayPauseIcon(true);
        } else {
            audioPlayer.pause();
            updatePlayPauseIcon(false);
        }
    });
    
    audioPlayer.addEventListener("play", () => updatePlayPauseIcon(true));
    audioPlayer.addEventListener("pause", () => updatePlayPauseIcon(false));
}

// 进度条控制
if (progressBar && audioPlayer) {
    let isDragging = false;
    
    // 拖动进度条
    progressBar.addEventListener("mousedown", () => {
        isDragging = true;
    });
    progressBar.addEventListener("mouseup", () => {
        isDragging = false;
    });
    progressBar.addEventListener("input", (e) => {
        if (audioPlayer.duration) {
            const time = (e.target.value / 100) * audioPlayer.duration;
            audioPlayer.currentTime = time;
        }
    });
    
    // 更新进度条时，如果正在拖动则不更新
    audioPlayer.addEventListener("timeupdate", () => {
        if (!isDragging && audioPlayer.duration) {
            const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            progressBar.value = progress;
            currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
        }
    });
}

// 音量控制
if (volumeBar && audioPlayer && muteBtn) {
    // 设置初始音量
    audioPlayer.volume = volumeBar.value / 100;
    
    // 音量滑块
    volumeBar.addEventListener("input", (e) => {
        const volume = e.target.value / 100;
        audioPlayer.volume = volume;
        audioPlayer.muted = false;
        updateVolumeIcon(false, volume);
    });
    
    // 静音按钮
    muteBtn.addEventListener("click", () => {
        audioPlayer.muted = !audioPlayer.muted;
        updateVolumeIcon(audioPlayer.muted, audioPlayer.volume);
    });
    
    // 更新音量图标
    audioPlayer.addEventListener("volumechange", () => {
        updateVolumeIcon(audioPlayer.muted, audioPlayer.volume);
        if (!audioPlayer.muted) {
            volumeBar.value = audioPlayer.volume * 100;
        }
    });
}

if (playerCloseBtn) {
    playerCloseBtn.addEventListener("click", closePlayer);
}
if (playerOverlay) {
    playerOverlay.addEventListener("click", closePlayer);
}

// ESC键关闭模态框
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        if (readerModal?.classList.contains("open")) {
            closeReader();
        }
        if (playerModal?.classList.contains("open")) {
            closePlayer();
        }
    }
});

initThemeControls();
initDashboardTabs();
initSidebarNav();
init();


