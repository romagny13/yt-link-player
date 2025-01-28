const DEFAULT_OPTIONS = {
  linkAttribute: "data-yt-link",
  targetAttribute: "data-yt-target",
  videoVisibleClass: "visible",
  videoWrapperClass: "video-wrapper",
  videoContainerClass: "video-container",
  transitionDuration: 500,
  onVideoShow: null,
  onVideoHide: null,
  onError: null,
  autoPlayOnShow: false,
  mute: false,
  pauseOnHide: true,
  autoReset: false,
  showOnInit: false,
  rootContainer: null,
  showPreviewOnHover: false,
  tooltipDelay: 300,
  tooltipDefaultWidth: 480,
  tooltipDefaultHeight: 270,
  tooltipZoomEffect: true,
  tooltipMobileWidth: "90vw",
  tooltipMobileHeight: "auto",
  tooltipMobilePosition: "center",
  tooltipMobileTimeout: 3000,
  tooltipFallbackImage:
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgwIiBoZWlnaHQ9IjI3MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWExYTFhIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiNmZmYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub24gZGlzcG9uaWJsZTwvdGV4dD48L3N2Zz4="
};

const TOOLTIP_STYLES = `
  @keyframes yt-preview-spin {
    0% { transform: translate(-50%, -50%) rotate(0deg); }
    100% { transform: translate(-50%, -50%) rotate(360deg); }
  }
  .yt-preview-tooltip::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 60px;
    background: linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.7));
  }
  .yt-preview-title {
    position: absolute;
    bottom: 12px;
    left: 12px;
    right: 12px;
    color: white;
    font-size: 14px;
    font-weight: 500;
    z-index: 1;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .yt-preview-play-button {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 68px;
    height: 48px;
    background-color: rgba(0, 0, 0, 0.8);
    border-radius: 12px;
    cursor: pointer;
    opacity: 0.9;
    transition: opacity 0.3s ease;
  }
  .yt-preview-play-button::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 55%;
    transform: translate(-50%, -50%);
    border-style: solid;
    border-width: 12px 0 12px 20px;
    border-color: transparent transparent transparent white;
  }
  .yt-preview-tooltip:hover .yt-preview-play-button {
    opacity: 1;
    background-color: #ff0000;
  }
  .yt-preview-tooltip[data-zoom="true"]:hover {
    transform: scale(1.02);
  }
  @media (hover: none) {
    .yt-preview-tooltip[data-zoom="true"]:hover {
      transform: none;
    }
    .yt-preview-tooltip .yt-preview-play-button {
      opacity: 1;
    }
  }
`;

class YouTubeAPIService {
  static loadAPI() {
    return new Promise((resolve, reject) => {
      if (window.YT && YT.Player) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onload = () => this._waitForAPI(resolve, reject);
      script.onerror = (err) => reject(err);
      document.body.appendChild(script);
    });
  }

  static _waitForAPI(resolve) {
    const checkInterval = setInterval(() => {
      if (window.YT && YT.Player) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
  }
}

class PlayerService {
  constructor() {
    this._players = new Map();
  }

  createPlayer(videoData, container, link, options) {
    const playerId = `youtube-player-${videoData.videoId}-${Date.now()}`;
    const playerDiv = document.createElement("div");
    playerDiv.id = playerId;
    container.appendChild(playerDiv);

    const playerConfig = this._createPlayerConfig(videoData, link, options);
    const player = new YT.Player(playerDiv.id, playerConfig);
    this._players.set(playerId, player);

    return playerId;
  }

  _createPlayerConfig(videoData, link, options) {
    const config = {
      videoId: videoData.videoId,
      playerVars: {
        enablejsapi: 1,
        origin: window.location.origin,
        mute: options.mute ? 1 : 0,
        autoplay: this._shouldAutoPlay(link, options) ? 1 : 0
      }
    };

    if (videoData.playlistId) {
      config.playerVars.list = videoData.playlistId;
    }

    return config;
  }

  getPlayer(playerId) {
    return this._players.get(playerId);
  }

  pausePlayer(playerId) {
    const player = this.getPlayer(playerId);
    if (player) {
      try {
        player.pauseVideo();
      } catch (error) {
        console.warn("Player not ready yet:", error);
      }
    }
  }

  resetPlayer(playerId, autoPlay) {
    const player = this.getPlayer(playerId);
    if (player) {
      try {
        player.seekTo(0, true);
        if (autoPlay) {
          player.playVideo();
        }
      } catch (error) {
        console.warn("Couldn't reset video:", error);
      }
    }
  }

  _shouldAutoPlay(link, options) {
    if (link.dataset.autoplay === "false") return false;
    if (link.dataset.autoplay === "true") return true;
    return options.autoPlayOnShow;
  }
}

class TooltipService {
  constructor(options) {
    this._options = options;
    this._tooltips = new Set();
    this._imageCache = new Map();
    this._cleanupInterval = null;
    this._isTouchDevice =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }

  addTooltip(link) {
    const thumbnailUrl = this._getThumbnailUrl(link.href);
    if (!thumbnailUrl) {
      console.warn(
        `No image preview found for the YouTube link '${link.href}'`
      );
      return;
    }

    this._addGlobalStyles();
    const tooltip = this._createTooltipElement(link);
    const { imageContainer, loader, playButton, title } =
      this._createTooltipComponents(link);

    tooltip.appendChild(loader);
    tooltip.appendChild(imageContainer);
    tooltip.appendChild(playButton);
    tooltip.appendChild(title);
    document.body.appendChild(tooltip);

    if (this._options.tooltipZoomEffect) {
      tooltip.dataset.zoom = "true";
    }

    this._setupTooltipBehavior(link, tooltip, imageContainer, thumbnailUrl);
    this._tooltips.add({ element: tooltip, link });
    this._initCleanupInterval();
  }

  hideTooltipForLink(link) {
    const tooltip = Array.from(this._tooltips).find((t) => t.link === link);
    if (tooltip) {
      tooltip.element.style.opacity = "0";
      setTimeout(() => {
        tooltip.element.style.display = "none";
      }, 300);
    }
  }

  _getThumbnailUrl(url) {
    const match = url.match(
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]*\/\S+\/|(?:v|e(?:mbed)?)\/|(?:.*?[?&]v=)|(?:.*?[?&]list=))([^"&?\/\s]{11}))/
    );
    return match
      ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`
      : null;
  }

  _addGlobalStyles() {
    if (!document.querySelector("#yt-preview-styles")) {
      const style = document.createElement("style");
      style.id = "yt-preview-styles";
      style.textContent = TOOLTIP_STYLES;
      document.head.appendChild(style);
    }
  }

  _createTooltipElement(link) {
    const tooltip = document.createElement("div");
    tooltip.classList.add("yt-preview-tooltip");

    const baseStyles = this._isTouchDevice
      ? this._getMobileTooltipStyles()
      : this._getDesktopTooltipStyles(link);

    Object.assign(tooltip.style, baseStyles);
    return tooltip;
  }

  _getMobileTooltipStyles() {
    const styles = {
      position: "fixed",
      display: "none",
      width: this._options.tooltipMobileWidth,
      height: this._options.tooltipMobileHeight,
      left: "50%",
      transform: "translateX(-50%)"
    };

    switch (this._options.tooltipMobilePosition) {
      case "top":
        styles.top = "20px";
        break;
      case "bottom":
        styles.bottom = "20px";
        break;
      default:
        styles.top = "50%";
        styles.transform = "translate(-50%, -50%)";
    }

    return styles;
  }

  _getDesktopTooltipStyles(link) {
    return {
      position: "fixed",
      display: "none",
      width: `${
        link.dataset.tooltipWidth || this._options.tooltipDefaultWidth
      }px`,
      height: `${
        link.dataset.tooltipHeight || this._options.tooltipDefaultHeight
      }px`,
      borderRadius: "12px",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
      overflow: "hidden",
      zIndex: "9999",
      transition: "all 0.3s ease",
      opacity: "0",
      background: "#1a1a1a",
      transform: "scale(1)"
    };
  }

  _createTooltipComponents(link) {
    return {
      imageContainer: this._createImageContainer(),
      loader: this._createLoader(),
      playButton: this._createPlayButton(),
      title: this._createTitle(link)
    };
  }

  _createImageContainer() {
    const container = document.createElement("div");
    Object.assign(container.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      backgroundSize: "cover",
      backgroundPosition: "center",
      opacity: "0",
      transition: "opacity 0.3s ease"
    });
    return container;
  }

  _createLoader() {
    const loader = document.createElement("div");
    loader.classList.add("yt-preview-loader");
    Object.assign(loader.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "40px",
      height: "40px",
      border: "3px solid rgba(255, 255, 255, 0.2)",
      borderTop: "3px solid #FFFFFF",
      borderRadius: "50%",
      animation: "yt-preview-spin 1s linear infinite"
    });
    return loader;
  }

  _createPlayButton() {
    const button = document.createElement("div");
    button.classList.add("yt-preview-play-button");
    button.setAttribute("aria-label", "Play video");
    return button;
  }

  _createTitle(link) {
    const title = document.createElement("div");
    title.classList.add("yt-preview-title");
    title.textContent = link.textContent || "YouTube Video";
    return title;
  }

  _setupTooltipBehavior(link, tooltip, imageContainer, thumbnailUrl) {
    if (this._isTouchDevice) {
      this._setupTouchEvents(link, tooltip, imageContainer, thumbnailUrl);
    } else {
      this._setupMouseEvents(link, tooltip, imageContainer, thumbnailUrl);
    }
  }

  _setupMouseEvents(link, tooltip, imageContainer, thumbnailUrl) {
    let showTooltipTimeout;
    let tooltipVisible = false;

    const showTooltip = (e) => {
      tooltipVisible = true;
      clearTimeout(showTooltipTimeout);

      const { left, top } = this._calculateTooltipPosition(e, tooltip);

      Object.assign(tooltip.style, {
        left: `${left}px`,
        top: `${top}px`,
        display: "block"
      });

      showTooltipTimeout = setTimeout(() => {
        if (tooltipVisible) {
          tooltip.style.opacity = "1";
        }
      }, this._options.tooltipDelay);
    };

    const hideTooltip = () => {
      tooltipVisible = false;
      clearTimeout(showTooltipTimeout);
      tooltip.style.opacity = "0";
      setTimeout(() => {
        if (!tooltipVisible) {
          tooltip.style.display = "none";
        }
      }, 300);
    };

    link.addEventListener("mouseenter", () => {
      this._preloadImage(thumbnailUrl, imageContainer);
      showTooltip(event);
    });
    link.addEventListener("mousemove", showTooltip);
    link.addEventListener("mouseleave", hideTooltip);
  }

  _setupTouchEvents(link, tooltip, imageContainer, thumbnailUrl) {
    let hideTimeout;

    link.addEventListener("click", (e) => {
      e.preventDefault();

      this._preloadImage(thumbnailUrl, imageContainer);

      const rect = link.getBoundingClientRect();
      tooltip.style.display = "block";
      tooltip.style.opacity = "1";

      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        tooltip.style.opacity = "0";
        setTimeout(() => {
          tooltip.style.display = "none";
        }, 300);
      }, this._options.tooltipMobileTimeout);
    });
  }

  _calculateTooltipPosition(event, tooltip) {
    const tooltipWidth = parseInt(tooltip.style.width);
    const tooltipHeight = parseInt(tooltip.style.height);

    let left = event.clientX + 20;
    if (left + tooltipWidth > window.innerWidth) {
      left = event.clientX - tooltipWidth - 20;
    }

    let top = event.clientY + 20;
    if (top + tooltipHeight > window.innerHeight) {
      top = event.clientY - tooltipHeight - 20;
    }

    return { left, top };
  }

  _preloadImage(url, imageContainer) {
    if (this._imageCache.has(url)) {
      imageContainer.style.backgroundImage = `url(${this._imageCache.get(
        url
      )})`;
      imageContainer.style.opacity = "1";
      return;
    }

    const img = new Image();
    img.onload = () => {
      this._imageCache.set(url, url);
      imageContainer.style.backgroundImage = `url(${url})`;
      imageContainer.style.opacity = "1";
    };
    img.onerror = () => {
      this._imageCache.set(url, this._options.tooltipFallbackImage);
      imageContainer.style.backgroundImage = `url(${this._options.tooltipFallbackImage})`;
      imageContainer.style.opacity = "1";
    };
    img.src = url;
  }

  _initCleanupInterval() {
    if (!this._cleanupInterval) {
      this._cleanupInterval = setInterval(() => this._cleanupTooltips(), 60000);
    }
  }

  _cleanupTooltips() {
    this._tooltips.forEach((tooltip) => {
      if (!document.body.contains(tooltip.link)) {
        tooltip.element.remove();
        this._tooltips.delete(tooltip);
      }
    });
  }
}

class VideoDataExtractor {
  static extract(url) {
    try {
      const videoRegex = /(?:youtu\.be\/|youtube\.com\/.*[?&]v=)([^&]+)/;
      const playlistRegex = /[?&]list=([^&]+)/;

      const videoMatch = url.match(videoRegex);
      const playlistMatch = url.match(playlistRegex);

      return {
        videoId: videoMatch ? videoMatch[1] : null,
        playlistId: playlistMatch ? playlistMatch[1] : null
      };
    } catch (error) {
      console.error(`Failed to extract video data: ${error.message}`);
      return null;
    }
  }
}

class VideoGroup {
  constructor(id) {
    this.id = id;
    this.visibleVideoLink = null;
    this.videos = new Set();
  }

  addVideo(video) {
    this.videos.add(video);
  }

  getVisibleVideo() {
    return Array.from(this.videos).find(
      ({ link }) => link === this.visibleVideoLink
    );
  }

  hideCurrentVideo(playerService, options) {
    const visibleVideo = this.getVisibleVideo();
    if (visibleVideo) {
      VideoManager.hideVideo(
        visibleVideo.container,
        visibleVideo.link,
        visibleVideo.videoData,
        playerService,
        options,
        this
      );
      this.visibleVideoLink = null;
    }
  }
}

class VideoManager {
  static hideVideo(
    container,
    link,
    videoData,
    playerService,
    options,
    group = null
  ) {
    const playerId = container.dataset.playerId;
    if (playerId && options.pauseOnHide) {
      playerService.pausePlayer(playerId);
    }

    container.classList.remove(options.videoVisibleClass);
    options.onVideoHide?.(container, link, videoData, group);
  }

  static showVideo(
    container,
    link,
    videoData,
    playerService,
    tooltipService,
    options,
    group = null
  ) {
    tooltipService.hideTooltipForLink(link);

    let playerId = container.dataset.playerId;
    if (!playerId) {
      playerId = playerService.createPlayer(
        videoData,
        container.querySelector(`.${options.videoContainerClass}`),
        link,
        options
      );
      container.dataset.playerId = playerId;
    } else if (VideoManager._shouldReset(link, options)) {
      playerService.resetPlayer(
        playerId,
        VideoManager._shouldAutoPlay(link, options)
      );
    }

    container.classList.add(options.videoVisibleClass);
    options.onVideoShow?.(container, link, videoData, group);
  }

  static _shouldReset(link, options) {
    if (link.hasAttribute("data-auto-reset")) {
      const resetValue = link.getAttribute("data-auto-reset").toLowerCase();
      return resetValue === "true" || resetValue === "";
    }
    return options.autoReset;
  }

  static _shouldAutoPlay(link, options) {
    if (link.dataset.autoplay === "false") return false;
    if (link.dataset.autoplay === "true") return true;
    return options.autoPlayOnShow;
  }
}

class YouTubeLinkPlayer {
  constructor(options = {}) {
    this.version = "1.13.0";
    this._options = { ...DEFAULT_OPTIONS, ...options };
    this._videoGroups = new Map();
    this._individualVideos = new Map();

    this._playerService = new PlayerService();
    this._tooltipService = new TooltipService(this._options);

    this._rootElement = this._getRootElement();

    YouTubeAPIService.loadAPI()
      .then(() => {
        this._init();
        this._handleInitialDisplay();
      })
      .catch((error) => console.error("Error loading YouTube API:", error));
  }

  _getRootElement() {
    return this._options.rootContainer instanceof HTMLElement
      ? this._options.rootContainer
      : document.querySelector(this._options.rootContainer) || document;
  }

  _init() {
    try {
      const videoLinks = this._rootElement.querySelectorAll(
        `a[${this._options.linkAttribute}]`
      );
      videoLinks.forEach(this._processLink.bind(this));
    } catch (error) {
      this._options.onError?.("Initialization failed: " + error.message);
    }
  }

  _processLink(link) {
    if (link.dataset.ytProcessed) return;

    const videoData = VideoDataExtractor.extract(link.href);
    if (videoData) {
      this._setupVideoContainer(link, videoData);
      if (this._shouldShowPreview(link)) {
        this._tooltipService.addTooltip(link);
      }
      link.dataset.ytProcessed = "true";
    }
  }

  _shouldShowPreview(link) {
    return (
      link.dataset.showPreview === "true" ||
      (this._options.showPreviewOnHover && link.dataset.showPreview !== "false")
    );
  }

  _setupVideoContainer(link, videoData) {
    const videoWrapper = document.createElement("div");
    videoWrapper.classList.add(this._options.videoWrapperClass);

    const videoContainer = document.createElement("div");
    videoContainer.className = this._options.videoContainerClass;
    videoContainer.dataset.videoId = videoData.videoId;
    if (videoData.playlistId) {
      videoContainer.dataset.playlistId = videoData.playlistId;
    }
    videoWrapper.appendChild(videoContainer);

    const targetId = link.getAttribute(this._options.targetAttribute);
    if (targetId) {
      this._setupGroupVideo(link, videoWrapper, videoData, targetId);
    } else {
      this._setupIndividualVideo(link, videoWrapper, videoData);
    }

    link.addEventListener("click", (e) => {
      e.preventDefault();
      this._handleVideoClick(link);
    });
  }

  _setupGroupVideo(link, videoWrapper, videoData, targetId) {
    const targetContainer = document.getElementById(targetId);
    if (!targetContainer) {
      this._options.onError?.(
        `Target container with id '${targetId}' not found`
      );
      return;
    }

    if (!this._videoGroups.has(targetId)) {
      this._videoGroups.set(targetId, new VideoGroup(targetId));
    }

    const group = this._videoGroups.get(targetId);
    group.addVideo({ link, container: videoWrapper, videoData });
    targetContainer.appendChild(videoWrapper);
  }

  _setupIndividualVideo(link, videoWrapper, videoData) {
    this._individualVideos.set(link, { container: videoWrapper, videoData });
    link.parentNode.insertBefore(videoWrapper, link.nextSibling);
  }

  _handleVideoClick(clickedLink) {
    const targetId = clickedLink.getAttribute(this._options.targetAttribute);
    if (targetId) {
      this._handleGroupVideo(clickedLink, targetId);
    } else {
      this._handleIndividualVideo(clickedLink);
    }
  }

  _handleGroupVideo(clickedLink, targetId) {
    const group = this._videoGroups.get(targetId);
    if (!group) return;

    if (group.visibleVideoLink === clickedLink) {
      group.hideCurrentVideo(this._playerService, this._options);
    } else {
      group.hideCurrentVideo(this._playerService, this._options);
      const video = Array.from(group.videos).find(
        (v) => v.link === clickedLink
      );
      if (video) {
        setTimeout(() => {
          VideoManager.showVideo(
            video.container,
            video.link,
            video.videoData,
            this._playerService,
            this._tooltipService,
            this._options,
            group
          );
          group.visibleVideoLink = video.link;
        }, this._options.transitionDuration);
      }
    }
  }

  _handleIndividualVideo(clickedLink) {
    const videoData = this._individualVideos.get(clickedLink);
    if (videoData) {
      const isVisible = videoData.container.classList.contains(
        this._options.videoVisibleClass
      );

      if (isVisible) {
        VideoManager.hideVideo(
          videoData.container,
          clickedLink,
          videoData.videoData,
          this._playerService,
          this._options
        );
      } else {
        VideoManager.showVideo(
          videoData.container,
          clickedLink,
          videoData.videoData,
          this._playerService,
          this._tooltipService,
          this._options
        );
      }
    }
  }

  _handleInitialDisplay() {
    this._individualVideos.forEach(({ container, videoData }, link) => {
      if (this._shouldShowOnInit(link)) {
        VideoManager.showVideo(
          container,
          link,
          videoData,
          this._playerService,
          this._tooltipService,
          this._options
        );
      }
    });

    this._videoGroups.forEach((group) => {
      const videoToShow = this._findInitialGroupVideo(group);
      if (videoToShow) {
        VideoManager.showVideo(
          videoToShow.container,
          videoToShow.link,
          videoToShow.videoData,
          this._playerService,
          this._tooltipService,
          this._options,
          group
        );
        group.visibleVideoLink = videoToShow.link;
      }
    });
  }

  _shouldShowOnInit(link) {
    if (link.hasAttribute("data-show-on-init")) {
      const showValue = link.getAttribute("data-show-on-init").toLowerCase();
      return showValue === "true" || showValue === "";
    }
    return this._options.showOnInit;
  }

  _findInitialGroupVideo(group) {
    let videoToShow = Array.from(group.videos).find(({ link }) =>
      this._shouldShowOnInit(link)
    );

    if (!videoToShow && this._options.showOnInit) {
      videoToShow = Array.from(group.videos)[0];
    }

    return videoToShow;
  }

  // Public API methods
  showAllVideos() {
    this._individualVideos.forEach(({ container, videoData }, link) => {
      VideoManager.showVideo(
        container,
        link,
        videoData,
        this._playerService,
        this._tooltipService,
        this._options
      );
    });

    this._videoGroups.forEach((group) => {
      if (!group.visibleVideoLink) {
        const firstVideo = Array.from(group.videos)[0];
        VideoManager.showVideo(
          firstVideo.container,
          firstVideo.link,
          firstVideo.videoData,
          this._playerService,
          this._tooltipService,
          this._options,
          group
        );
        group.visibleVideoLink = firstVideo.link;
      }
    });
  }

  hideAllVideos() {
    this._individualVideos.forEach(({ container, videoData }, link) => {
      VideoManager.hideVideo(
        container,
        link,
        videoData,
        this._playerService,
        this._options
      );
    });

    this._videoGroups.forEach((group) => {
      group.hideCurrentVideo(this._playerService, this._options);
    });
  }

  getPlayer(container) {
    const playerId = container.dataset.playerId;
    return this._playerService.getPlayer(playerId);
  }
}

window.YouTubeLinkPlayer = YouTubeLinkPlayer;
