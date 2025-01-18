class YouTubeLinkPlayer {
  constructor(options = {}) {
    this.options = {
      linkAttribute: "data-yt-link",
      targetAttribute: "data-yt-target",
      videoVisibleClass: "visible",
      videoWrapperClass: "video-wrapper",
      videoContainerClass: "video-container",
      transitionDuration: 500,
      onVideoShow: null,
      onVideoHide: null,
      ...options,
    };

    this.videoGroups = new Map(); // Map<targetId, {visibleVideoLink: Link, videos: Set<{link, container}>}>
    this.individualVideos = new Map(); // Map<link, container>

    this.init();
  }

  init() {
    const videoLinks = document.querySelectorAll(
      `a[${this.options.linkAttribute}]`
    );

    videoLinks.forEach((link) => {
      if (link.dataset.ytProcessed) return;

      const videoId = this.extractVideoId(link.href);
      if (!videoId) return;

      this.setupVideoContainer(link, videoId);
      link.dataset.ytProcessed = "true";
    });
  }

  extractVideoId(url) {
    const regex =
      /(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/user\/\S+|\/ytscreeningroom\?v=|\/sandalsResorts#\w\/\w\/.*\/))([^\/&\?]{10,12})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  setupVideoContainer(link, videoId) {
    const videoWrapper = document.createElement("div");
    videoWrapper.classList.add(this.options.videoWrapperClass);

    const videoContainer = document.createElement("div");
    videoContainer.className = this.options.videoContainerClass;

    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube.com/embed/${videoId}`;
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;

    videoContainer.appendChild(iframe);
    videoWrapper.appendChild(videoContainer);

    const targetId = link.getAttribute(this.options.targetAttribute);
    let targetContainer = null;

    if (targetId) {
      targetContainer = document.getElementById(targetId);
      if (targetContainer) {
        if (!this.videoGroups.has(targetId)) {
          this.videoGroups.set(targetId, new Set());
        }
        this.videoGroups.get(targetId).add({ link, container: videoWrapper });
        targetContainer.appendChild(videoWrapper);
      } else {
        console.warn(`Target container with id '${targetId}' not found`);
      }
    } else {
      this.individualVideos.set(link, videoWrapper);
      link.parentNode.insertBefore(videoWrapper, link.nextSibling);
    }

    link.addEventListener("click", (e) => {
      e.preventDefault();
      this.handleVideoClick(link);
    });
  }

  handleVideoClick(clickedLink) {
    const targetId = clickedLink.getAttribute(this.options.targetAttribute);

    if (targetId) {
      const group = this.videoGroups.get(targetId);
      if (group) {
        group.forEach(({ link, container }) => {
          if (link === clickedLink) {
            this.toggleVisibility(group, link, container);
          } else {
            this.hideVideo(container, link);
          }
        });
      }
    } else {
      const container = this.individualVideos.get(clickedLink);
      if (container) {
        this.toggleVideo(container, clickedLink);
      }
    }
  }

  toggleVisibility(group, link, container) {
    if (group.visibleVideoLink === link) {
      this.hideVideo(container, link);
      group.visibleVideoLink = null;
    } else {
      const duration = group.visibleVideoLink
        ? this.options.transitionDuration
        : 0;
      this.showVideoWithDelay(container, link, duration, group);
    }
  }

  showVideoWithDelay(container, link, duration, group) {
    setTimeout(() => {
      container.classList.add(this.options.videoVisibleClass);
      group.visibleVideoLink = link;
    }, duration);
  }

  hideVideo(container, link) {
    container.classList.remove(this.options.videoVisibleClass);
    if (this.options.onVideoHide) {
      this.options.onVideoHide(container, link);
    }
  }

  toggleVideo(container, link) {
    const isVisible = container.classList.contains(
      this.options.videoVisibleClass
    );
    if (!isVisible) {
      container.classList.add(this.options.videoVisibleClass);
    } else {
      this.hideVideo(container, link);
    }
  }
}
