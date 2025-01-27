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

function getThumbnailUrl(youtubeUrl) {
  const videoIdMatch = youtubeUrl.match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]*\/\S+\/|(?:v|e(?:mbed)?)\/|(?:.*?[?&]v=)|(?:.*?[?&]list=))([^"&?\/\s]{11}))/
  );

  if (videoIdMatch) {
    // C'est une vidéo, retourner l'URL de la miniature
    return `https://img.youtube.com/vi/${videoIdMatch[1]}/maxresdefault.jpg`;
  }
  return null;
}

class YouTubeLinkPlayer {
  constructor(options = {}) {
    this._videoGroups = new Map();
    this._individualVideos = new Map();
    this._players = new Map();
    this._options = {
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
      showPreviewOnHover: false, // Option pour afficher l'aperçu
      ...options,
    };

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

  _addPreviewTooltip(link) {
    const thumbnailUrl = getThumbnailUrl(link.href);
    if (!thumbnailUrl) {
      console.warn(`Image preview not found for '${link.href}'`);
      return;
    }

    const tooltip = document.createElement("div");
    tooltip.classList.add("yt-preview-tooltip");
    tooltip.style.position = "absolute";
    tooltip.style.display = "none";
    tooltip.style.backgroundSize = "cover"; 
    tooltip.style.backgroundPosition = "center"; 
    tooltip.style.backgroundRepeat = "no-repeat";
    tooltip.style.width = "200px";
    tooltip.style.height = "113px";
    document.body.appendChild(tooltip);

    link.addEventListener("mouseenter", (e) => {
        tooltip.style.backgroundImage = `url(${thumbnailUrl})`;
        tooltip.style.left = `${e.pageX + 10}px`;
        tooltip.style.top = `${e.pageY + 10}px`;
        tooltip.style.display = "block";
    });

    link.addEventListener("mouseleave", () => {
      tooltip.style.display = "none"; 
    });
  }

  _extractVideoData(url) {
    try {
      const videoRegex = /(?:youtu\.be\/|youtube\.com\/.*[?&]v=)([^&]+)/;
      const playlistRegex = /[?&]list=([^&]+)/;

      const videoMatch = url.match(videoRegex);
      const playlistMatch = url.match(playlistRegex);

      return {
        videoId: videoMatch ? videoMatch[1] : null,
        playlistId: playlistMatch ? playlistMatch[1] : null,
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
        autoplay: this._shouldAutoPlay(link) ? 1 : 0,
      },
      events: {
        onReady: () => {
          // Player ready
        },
      },
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
          id: targetId,
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

  _showVideo(container, link, videoData, group = null) {
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
