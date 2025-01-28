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
  tooltipMobilePosition: "center", // 'top', 'center', 'bottom'
  tooltipMobileTimeout: 3000,
  tooltipFallbackImage:
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgwIiBoZWlnaHQ9IjI3MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWExYTFhIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiNmZmYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub24gZGlzcG9uaWJsZTwvdGV4dD48L3N2Zz4="
};

function loadYouTubeAPI() {
  return new Promise((resolve, reject) => {
    if (window.YT && YT.Player) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onload = () => waitForYouTubeAPI(resolve, reject);
    script.onerror = (err) => reject(err);
    document.body.appendChild(script);
  });
}

function waitForYouTubeAPI(resolve, reject) {
  const checkInterval = setInterval(() => {
    if (window.YT && YT.Player) {
      clearInterval(checkInterval);
      resolve();
    }
  }, 100);
}

class YouTubeLinkPlayer {
  constructor(options = {}) {
    this.version = "1.13.0";
    this._videoGroups = new Map();
    this._individualVideos = new Map();
    this._players = new Map();
    this._imageCache = new Map();
    this._tooltips = new Set();
    this._options = {
      ...DEFAULT_OPTIONS,
      ...options
    };

    // Détection du support tactile
    this._isTouchDevice =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;

    this._rootElement =
      this._options.rootContainer instanceof HTMLElement
        ? this._options.rootContainer
        : document.querySelector(this._options.rootContainer) || document;

    loadYouTubeAPI()
      .then(() => {
        this._init();
        this._handleInitialDisplay();
      })
      .catch((error) =>
        console.error("Erreur lors du chargement de l'API YouTube :", error)
      );
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

    const videoData = this._extractVideoData(link.href);
    if (videoData) {
      this._setupVideoContainer(link, videoData);
      if (
        link.dataset.showPreview === "true" ||
        (this._options.showPreviewOnHover &&
          link.dataset.showPreview !== "false")
      ) {
        this._addPreviewTooltip(link);
      }
      link.dataset.ytProcessed = "true";
    }
  }

  // obtient la preview image url
  _getThumbnailUrl(youtubeUrl) {
    const videoIdMatch = youtubeUrl.match(
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]*\/\S+\/|(?:v|e(?:mbed)?)\/|(?:.*?[?&]v=)|(?:.*?[?&]list=))([^"&?\/\s]{11}))/
    );

    if (videoIdMatch) {
      return `https://img.youtube.com/vi/${videoIdMatch[1]}/hqdefault.jpg`;
    }
    return null;
  }

  _cacheImage(url) {
    if (this._imageCache.has(url)) {
      return Promise.resolve(this._imageCache.get(url));
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this._imageCache.set(url, url);
        resolve(url);
      };
      img.onerror = () => {
        this._imageCache.set(url, this._options.tooltipFallbackImage);
        resolve(this._options.tooltipFallbackImage);
      };
      img.src = url;
    });
  }

  _cleanupTooltips() {
    this._tooltips.forEach((tooltip) => {
      if (!document.body.contains(tooltip.link)) {
        tooltip.element.remove();
        this._tooltips.delete(tooltip);
      }
    });
  }

  _isVideoVisible(link) {
    // Vérifier si la vidéo fait partie d'un groupe
    const targetId = link.getAttribute(this._options.targetAttribute);
    if (targetId) {
      const group = this._videoGroups.get(targetId);
      return group && group.visibleVideoLink === link;
    }

    // Vérifier si c'est une vidéo individuelle
    const videoData = this._individualVideos.get(link);
    if (videoData) {
      return videoData.container.classList.contains(
        this._options.videoVisibleClass
      );
    }

    return false;
  }

  _addPreviewTooltip(link) {
    const thumbnailUrl = this._getThumbnailUrl(link.href);
    if (!thumbnailUrl) {
      console.warn(
        `No image preview found for the YouTube link '${link.href}'`
      );
      return;
    }

    // Ajout des styles globaux
    this._addGlobalStyles();

    // Création et configuration du tooltip
    const tooltip = this._createTooltipElement(link);
    const imageContainer = this._createImageContainer();
    const loader = this._createLoader();
    const playButton = this._createPlayButton();
    const title = this._createTitle(link);

    // Assemblage des éléments
    tooltip.appendChild(loader);
    tooltip.appendChild(imageContainer);
    tooltip.appendChild(playButton);
    tooltip.appendChild(title);
    document.body.appendChild(tooltip);

    // Activation du zoom si configuré
    if (this._options.tooltipZoomEffect) {
      tooltip.dataset.zoom = "true";
    }

    // Gestion des événements en fonction du type d'appareil
    if (this._isTouchDevice) {
      this._setupTouchEvents(link, tooltip, imageContainer, thumbnailUrl);
    } else {
      this._setupMouseEvents(link, tooltip, imageContainer, thumbnailUrl);
    }

    // Ajout au tracker de tooltips
    this._tooltips.add({ element: tooltip, link });

    // Nettoyage périodique des tooltips
    if (!this._cleanupInterval) {
      this._cleanupInterval = setInterval(() => this._cleanupTooltips(), 60000);
    }
  }

  _addGlobalStyles() {
    if (!document.querySelector("#yt-preview-styles")) {
      const style = document.createElement("style");
      style.id = "yt-preview-styles";
      style.textContent = `
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
      document.head.appendChild(style);
    }
  }

  _createTooltipElement(link) {
    const tooltip = document.createElement("div");
    tooltip.classList.add("yt-preview-tooltip");

    const baseStyles = {
      position: "fixed",
      display: "none",
      borderRadius: "12px",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
      overflow: "hidden",
      zIndex: "9999",
      transition: "all 0.3s ease",
      opacity: "0",
      background: "#1a1a1a",
      transform: "scale(1)"
    };

    if (this._isTouchDevice) {
      Object.assign(baseStyles, {
        width: this._options.tooltipMobileWidth,
        height: this._options.tooltipMobileHeight,
        left: "50%",
        transform: "translateX(-50%)"
      });

      // Position verticale en fonction de l'option
      switch (this._options.tooltipMobilePosition) {
        case "top":
          baseStyles.top = "20px";
          break;
        case "bottom":
          baseStyles.bottom = "20px";
          break;
        default: // 'center'
          baseStyles.top = "50%";
          baseStyles.transform = "translate(-50%, -50%)";
      }
    } else {
      Object.assign(baseStyles, {
        width: `${
          link.dataset.tooltipWidth || this._options.tooltipDefaultWidth
        }px`,
        height: `${
          link.dataset.tooltipHeight || this._options.tooltipDefaultHeight
        }px`
      });
    }

    Object.assign(tooltip.style, baseStyles);
    return tooltip;
  }

  _createImageContainer() {
    const imageContainer = document.createElement("div");
    Object.assign(imageContainer.style, {
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
    return imageContainer;
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
    const playButton = document.createElement("div");
    playButton.classList.add("yt-preview-play-button");
    playButton.setAttribute("aria-label", "Lire la vidéo");
    return playButton;
  }

  _createTitle(link) {
    const title = document.createElement("div");
    title.classList.add("yt-preview-title");
    title.textContent = link.textContent || "YouTube Video";
    return title;
  }

  _setupTouchEvents(link, tooltip, imageContainer, thumbnailUrl) {
    let touchTimeout;

    const showTooltip = async (e) => {
      e.preventDefault();

      if (this._isVideoVisible(link)) return;

      // Préchargement de l'image
      const cachedUrl = await this._cacheImage(thumbnailUrl);
      imageContainer.style.backgroundImage = `url(${cachedUrl})`;
      imageContainer.style.opacity = "1";
      tooltip.querySelector(".yt-preview-loader").style.display = "none";

      // Affichage du tooltip
      tooltip.style.display = "block";
      requestAnimationFrame(() => {
        tooltip.style.opacity = "1";
      });

      // Timer pour masquer automatiquement
      clearTimeout(touchTimeout);
      touchTimeout = setTimeout(() => {
        hideTooltip();
      }, this._options.tooltipMobileTimeout);
    };

    const hideTooltip = () => {
      clearTimeout(touchTimeout);
      tooltip.style.opacity = "0";
      setTimeout(() => {
        tooltip.style.display = "none";
      }, 300);
    };

    // Gestionnaire d'événements tactiles
    let touchStartTime = 0;
    const longPressDelay = 500;
    let longPressTimer;

    link.addEventListener(
      "touchstart",
      (e) => {
        touchStartTime = Date.now();
        longPressTimer = setTimeout(() => {
          showTooltip(e);
        }, longPressDelay);
      },
      { passive: false }
    );

    link.addEventListener("touchend", (e) => {
      clearTimeout(longPressTimer);
      const touchDuration = Date.now() - touchStartTime;

      if (touchDuration < longPressDelay) {
        hideTooltip();
      }
    });

    link.addEventListener("touchmove", () => {
      clearTimeout(longPressTimer);
    });

    // Fermeture au clic en dehors
    document.addEventListener("click", (e) => {
      if (!tooltip.contains(e.target) && !link.contains(e.target)) {
        hideTooltip();
      }
    });
  }

  _setupMouseEvents(link, tooltip, imageContainer, thumbnailUrl) {
    let showTooltipTimeout;
    let tooltipVisible = false;

    const showTooltip = (e) => {
      if (this._isVideoVisible(link)) return;

      tooltipVisible = true;
      clearTimeout(showTooltipTimeout);

      const tooltipWidth = parseInt(tooltip.style.width);
      const tooltipHeight = parseInt(tooltip.style.height);

      let left = e.clientX + 20;
      if (left + tooltipWidth > window.innerWidth) {
        left = e.clientX - tooltipWidth - 20;
      }

      let top = e.clientY + 20;
      if (top + tooltipHeight > window.innerHeight) {
        top = e.clientY - tooltipHeight - 20;
      }

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

    // Préchargement de l'image
    const preloadImage = async () => {
      const cachedUrl = await this._cacheImage(thumbnailUrl);
      imageContainer.style.backgroundImage = `url(${cachedUrl})`;
      imageContainer.style.opacity = "1";
      tooltip.querySelector(".yt-preview-loader").style.display = "none";
      if (tooltipVisible) {
        tooltip.style.opacity = "1";
      }
    };

    link.addEventListener("mouseenter", () => {
      preloadImage();
      showTooltip(event);
    });
    link.addEventListener("mousemove", showTooltip);
    link.addEventListener("mouseleave", hideTooltip);
  }

  // extrait le video id et playlist id
  _extractVideoData(url) {
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
      this._options.onError?.(`Failed to extract video data: ${error.message}`);
      return null;
    }
  }

  _createPlayer(videoData, container, link) {
    const playerId = `youtube-player-${videoData.videoId}-${Date.now()}`;
    const playerDiv = document.createElement("div");
    playerDiv.id = playerId;
    container.appendChild(playerDiv);

    const playerConfig = {
      videoId: videoData.videoId,
      playerVars: {
        enablejsapi: 1,
        origin: window.location.origin,
        mute: this._options.mute ? 1 : 0,
        autoplay: this._shouldAutoPlay(link) ? 1 : 0
      },
      events: {
        onReady: () => {
          // Player ready
        }
      }
    };

    if (videoData.playlistId) {
      playerConfig.playerVars.list = videoData.playlistId;
    }

    const player = new YT.Player(playerDiv.id, playerConfig);
    this._players.set(playerId, player);
    return playerId;
  }

  _shouldAutoPlay(link) {
    if (link.dataset.autoplay === "false") return false;
    if (link.dataset.autoplay === "true") return true;
    return this._options.autoPlayOnShow;
  }

  _setupVideoContainer(link, videoData) {
    try {
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
    } catch (error) {
      this._options.onError?.(
        `Failed to setup video container: ${error.message}`,
        link
      );
    }
  }

  _setupGroupVideo(link, videoWrapper, videoData, targetId) {
    const targetContainer = document.getElementById(targetId);
    if (targetContainer) {
      if (!this._videoGroups.has(targetId)) {
        this._videoGroups.set(targetId, {
          visibleVideoLink: null,
          videos: new Set(),
          id: targetId
        });
      }
      this._videoGroups
        .get(targetId)
        .videos.add({ link, container: videoWrapper, videoData });
      targetContainer.appendChild(videoWrapper);
    } else {
      this._options.onError?.(
        `Target container with id '${targetId}' not found`,
        link
      );
    }
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
    if (group) {
      group.videos.forEach(({ link, container, videoData }) => {
        if (link === clickedLink) {
          this._toggleVisibility(group, link, container, videoData);
        } else {
          this._hideVideo(container, link, videoData, group);
        }
      });
    }
  }

  _handleIndividualVideo(clickedLink) {
    const videoData = this._individualVideos.get(clickedLink);
    if (videoData) {
      this._toggleVideo(videoData.container, clickedLink, videoData.videoData);
    }
  }

  _toggleVisibility(group, link, container, videoData) {
    if (group.visibleVideoLink === link) {
      this._hideVideo(container, link, videoData, group);
      group.visibleVideoLink = null;
    } else {
      const duration = group.visibleVideoLink
        ? this._options.transitionDuration
        : 0;
      this._showVideoWithDelay(container, link, videoData, duration, group);
    }
  }

  _showVideoWithDelay(container, link, videoData, duration, group) {
    setTimeout(() => {
      this._showVideo(container, link, videoData, group);
      if (group) group.visibleVideoLink = link;
    }, duration);
  }

  _hideVideo(container, link, videoData, group = null) {
    const playerId = container.dataset.playerId;
    if (!playerId) return;

    const player = this._players.get(playerId);
    if (player && this._options.pauseOnHide) {
      try {
        player.pauseVideo();
      } catch (error) {
        console.warn("Player not ready yet:", error);
      }
    }

    container.classList.remove(this._options.videoVisibleClass);
    this._options.onVideoHide?.(container, link, videoData, group);
  }

  _hideTooltipForLink(link) {
    // Find and hide the tooltip associated with this link
    for (const tooltip of this._tooltips) {
      if (tooltip.link === link) {
        tooltip.element.style.opacity = "0";
        setTimeout(() => {
          tooltip.element.style.display = "none";
        }, 300);
        break;
      }
    }
  }

  _showVideo(container, link, videoData, group = null) {
    this._hideTooltipForLink(link);

    let playerId = container.dataset.playerId;

    if (!playerId) {
      playerId = this._createPlayer(
        videoData,
        container.querySelector(`.${this._options.videoContainerClass}`),
        link
      );
      container.dataset.playerId = playerId;
    } else {
      const player = this._players.get(playerId);

      const shouldReset = this._shouldReset(link);

      if (shouldReset && player) {
        try {
          player.seekTo(0, true);
          if (this._shouldAutoPlay(link)) {
            player.playVideo();
          }
        } catch (error) {
          console.warn("Couldn't reset video:", error);
        }
      }
    }

    container.classList.add(this._options.videoVisibleClass);
    this._options.onVideoShow?.(container, link, videoData, group);
  }

  _shouldReset(link) {
    if (link.hasAttribute("data-auto-reset")) {
      const resetValue = link.getAttribute("data-auto-reset").toLowerCase();
      return resetValue === "true" || resetValue === "";
    }
    return this._options.autoReset;
  }

  _toggleVideo(container, link, videoData) {
    const isVisible = container.classList.contains(
      this._options.videoVisibleClass
    );
    if (!isVisible) {
      this._showVideo(container, link, videoData);
    } else {
      this._hideVideo(container, link, videoData);
    }
  }

  initializeContainer(container) {
    const videoLinks = container.querySelectorAll(
      `a[${this._options.linkAttribute}]`
    );
    videoLinks.forEach(this._processLink.bind(this));
  }

  showAllVideos() {
    this._individualVideos.forEach(({ container, videoData }, link) => {
      this._showVideo(container, link, videoData);
    });

    this._videoGroups.forEach((group) => {
      if (!group.visibleVideoLink) {
        const firstVideo = Array.from(group.videos)[0];
        this._showVideo(
          firstVideo.container,
          firstVideo.link,
          firstVideo.videoData,
          group
        );
        group.visibleVideoLink = firstVideo.link;
      }
    });
  }

  hideAllVideos() {
    this._individualVideos.forEach(({ container, videoData }, link) => {
      this._hideVideo(container, link, videoData);
    });

    this._videoGroups.forEach((group) => {
      if (group.visibleVideoLink) {
        const visibleVideo = Array.from(group.videos).find(
          ({ link }) => link === group.visibleVideoLink
        );
        if (visibleVideo) {
          this._hideVideo(
            visibleVideo.container,
            visibleVideo.link,
            visibleVideo.videoData,
            group
          );
        }
        group.visibleVideoLink = null;
      }
    });
  }

  _shouldShowOnInit(link) {
    // Vérifier d'abord l'attribut sur le lien
    if (link.hasAttribute("data-show-on-init")) {
      const showValue = link.getAttribute("data-show-on-init").toLowerCase();
      return showValue === "true" || showValue === "";
    }
    // Sinon, utiliser l'option globale
    return this._options.showOnInit;
  }

  _handleInitialDisplay() {
    // Gestion des vidéos individuelles
    this._individualVideos.forEach(({ container, videoData }, link) => {
      if (this._shouldShowOnInit(link)) {
        this._showVideo(container, link, videoData);
      }
    });

    // Gestion des groupes
    this._videoGroups.forEach((group) => {
      let videoToShow = null;

      // Chercher d'abord une vidéo marquée comme initiale dans le groupe
      for (const video of group.videos) {
        if (this._shouldShowOnInit(video.link)) {
          videoToShow = video;
          break;
        }
      }

      // Si aucune vidéo n'est marquée mais que l'option globale est activée, prendre la première
      if (!videoToShow && this._options.showOnInit) {
        videoToShow = Array.from(group.videos)[0];
      }

      if (videoToShow) {
        this._showVideo(
          videoToShow.container,
          videoToShow.link,
          videoToShow.videoData,
          group
        );
        group.visibleVideoLink = videoToShow.link;
      }
    });
  }

  getPlayer(container) {
    const playerId = container.dataset.playerId;
    return this._players.get(playerId);
  }
}

window.YouTubeLinkPlayer = YouTubeLinkPlayer;
