document.addEventListener("DOMContentLoaded", () => {
  const getRoom = () =>
    window.location.pathname.startsWith("/r/")
      ? window.location.pathname.split("/")[2]
      : "public";
  let currentRoom = getRoom();
  let deviceName = localStorage.getItem("device_name");
  if (!deviceName) {
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    const os = /Windows/i.test(navigator.userAgent)
      ? "PC"
      : /Mac/i.test(navigator.userAgent)
        ? "Mac"
        : isMobile
          ? "Mobile"
          : "Device";
    deviceName = `Unknown ${os}`;
    localStorage.setItem("device_name", deviceName);
  }

  // DOM Elements
  const authScreen = document.getElementById("auth-screen");
  const appScreen = document.getElementById("app");
  const authPassword = document.getElementById("auth-password");
  const authSubmit = document.getElementById("auth-submit");
  const authError = document.getElementById("auth-error");

  const btnTheme = document.getElementById("btn-theme");
  const roomBadge = document.getElementById("room-badge");
  const statusIndicator = document.getElementById("status-indicator");
  const statusText = document.getElementById("status-text");

  const tabs = document.querySelectorAll(".tab");
  const textInput = document.getElementById("text-input");
  const btnShareText = document.getElementById("btn-share-text");

  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const cameraInput = document.getElementById("camera-input");
  const btnChooseFiles = document.getElementById("btn-choose-files");
  const btnCamera = document.getElementById("btn-camera");

  const uploadProgressContainer = document.getElementById(
    "upload-progress-container",
  );
  const uploadProgress = document.getElementById("upload-progress");
  const uploadStatus = document.getElementById("upload-status");

  const searchInput = document.getElementById("search-input");
  const filterSelect = document.getElementById("filter-select");
  const btnDownloadAll = document.getElementById("btn-download-all");
  const btnClearAll = document.getElementById("btn-clear-all");

  const itemsFeed = document.getElementById("items-feed");

  // Modals
  const btnQr = document.getElementById("btn-qr");
  const qrModal = document.getElementById("qr-modal");
  const closeQr = document.getElementById("close-qr");
  const qrCanvas = document.getElementById("qr-canvas");
  const btnNewRoom = document.getElementById("btn-new-room");
  const qrRoomName = document.getElementById("qr-room-name");

  const previewModal = document.getElementById("preview-modal");
  const closePreview = document.getElementById("close-preview");
  const previewContainer = document.getElementById("preview-container");

  // Socket setup
  const socket = io();

  // Initialization
  const init = async () => {
    roomBadge.textContent = `Room: ${currentRoom}`;

    // Theme setup
    const savedTheme =
      localStorage.getItem("theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light");
    document.documentElement.setAttribute("data-theme", savedTheme);
    btnTheme.textContent = savedTheme === "dark" ? "☀️" : "🌙";

    // Check auth
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      if (data.authRequired && !data.authenticated) {
        authScreen.classList.remove("hidden");
      } else {
        showApp();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const showApp = () => {
    authScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    loadItems();
    socket.emit("join", currentRoom);
  };

  // Auth
  authSubmit.addEventListener("click", async () => {
    const password = authPassword.value;
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      showApp();
    } else {
      const data = await res.json();
      authError.textContent = data.error || "Login failed";
      authError.classList.remove("hidden");
    }
  });

  authPassword.addEventListener("keyup", (e) => {
    if (e.key === "Enter") authSubmit.click();
  });

  // Theme Toggle
  btnTheme.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    btnTheme.textContent = next === "dark" ? "☀️" : "🌙";
  });

  // Tabs
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.target).classList.add("active");
    });
  });

  // Share Text
  btnShareText.addEventListener("click", async () => {
    const content = textInput.value.trim();
    if (!content) return;

    btnShareText.disabled = true;
    try {
      await fetch("/api/items/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, room: currentRoom, deviceName }),
      });
      textInput.value = "";
    } catch (err) {
      showToast("Error sharing text");
    } finally {
      btnShareText.disabled = false;
    }
  });

  // File Upload Handling
  const uploadFiles = async (files) => {
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }
    formData.append("room", currentRoom);
    formData.append("deviceName", deviceName);

    uploadProgressContainer.classList.remove("hidden");
    uploadProgress.style.width = "0%";
    uploadStatus.textContent = `Uploading ${files.length} file(s)...`;

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/items/file");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        uploadProgress.style.width = percent + "%";
        uploadStatus.textContent = `Uploading... ${percent}%`;
      }
    };

    xhr.onload = () => {
      uploadProgressContainer.classList.add("hidden");
      if (xhr.status === 200) {
        showToast(`Uploaded ${files.length} file(s)`);
      } else {
        const res = JSON.parse(xhr.responseText);
        showToast(res.error || "Upload failed");
      }
    };

    xhr.onerror = () => {
      uploadProgressContainer.classList.add("hidden");
      showToast("Upload failed due to network error");
    };

    xhr.send(formData);
  };

  btnChooseFiles.addEventListener("click", () => fileInput.click());
  btnCamera.addEventListener("click", () => cameraInput.click());

  fileInput.addEventListener("change", () => {
    uploadFiles(fileInput.files);
    fileInput.value = "";
  });
  cameraInput.addEventListener("change", () => {
    uploadFiles(cameraInput.files);
    cameraInput.value = "";
  });

  // Drag and drop
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", () =>
    dropZone.classList.remove("dragover"),
  );
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    uploadFiles(e.dataTransfer.files);
  });
  dropZone.addEventListener("click", () => fileInput.click());

  // Paste image
  document.addEventListener("paste", (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    const files = [];
    for (let item of items) {
      if (item.kind === "file") {
        files.push(item.getAsFile());
      }
    }
    if (files.length > 0) uploadFiles(files);
  });

  // Filtering & Search
  let searchTimeout;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadItems, 300);
  });
  filterSelect.addEventListener("change", loadItems);

  // Load Items
  async function loadItems() {
    const q = searchInput.value;
    const type = filterSelect.value;
    const res = await fetch(
      `/api/items?room=${currentRoom}&type=${type}&q=${q}`,
    );
    if (res.ok) {
      const items = await res.json();
      renderItems(items);
    }
  }

  function renderItems(items) {
    itemsFeed.innerHTML = "";
    if (items.length === 0) {
      itemsFeed.innerHTML =
        '<p style="text-align:center; color:var(--text-muted);">No items found.</p>';
      return;
    }
    items.forEach((item) => {
      const el = document.createElement("div");
      el.className = "item-card";
      const sizeStr = item.size
        ? ` • ${(item.size / 1024 / 1024).toFixed(2)} MB`
        : "";
      const dateStr = new Date(item.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      let contentHtml = "";
      if (item.type === "text") {
        contentHtml = `<div class="text-content">${escapeHtml(item.content)}</div>`;
      } else if (item.type === "file") {
        const streamUrl = `/api/items/${item.id}/stream`;
        if (item.mime_type && item.mime_type.startsWith("image/")) {
          contentHtml = `<div class="file-preview"><img src="${streamUrl}" alt="${escapeHtml(item.original_filename)}" onclick="previewImage('${streamUrl}')"></div>`;
        } else if (item.mime_type && item.mime_type.startsWith("video/")) {
          contentHtml = `<div class="file-preview"><video src="${streamUrl}" controls preload="metadata"></video></div>`;
        } else if (item.mime_type && item.mime_type.startsWith("audio/")) {
          contentHtml = `<div class="file-preview"><audio src="${streamUrl}" controls></audio></div>`;
        }
        contentHtml += `<span class="file-name">${escapeHtml(item.original_filename)}</span>`;
      }

      let actionsHtml = "";
      if (item.type === "text") {
        actionsHtml += `<button class="secondary-btn" onclick="copyText(this, \`${escapeHtml(item.content).replace(/`/g, "\\`")}\`)">Copy</button>`;
      } else {
        actionsHtml += `<button class="secondary-btn" onclick="window.location.href='/api/items/${item.id}/download'">Download</button>`;
        if (item.mime_type === "application/pdf") {
          actionsHtml += `<button class="secondary-btn" onclick="window.open('/api/items/${item.id}/stream', '_blank')">View</button>`;
        }
      }
      actionsHtml += `<button class="danger-btn" onclick="deleteItem('${item.id}')">Delete</button>`;

      el.innerHTML = `
        <div class="item-header">
          <span><strong>${escapeHtml(item.device_name)}</strong></span>
          <span>${dateStr}${sizeStr}</span>
        </div>
        ${contentHtml}
        <div class="item-actions">${actionsHtml}</div>
      `;
      itemsFeed.appendChild(el);
    });
  }

  // Actions
  window.copyText = (btn, text) => {
    navigator.clipboard.writeText(text).then(() => {
      const original = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = original), 2000);
    });
  };

  window.deleteItem = async (id) => {
    if (!confirm("Delete this item?")) return;
    await fetch(`/api/items/${id}`, { method: "DELETE" });
  };

  btnDownloadAll.addEventListener("click", () => {
    window.location.href = `/api/download-all?room=${currentRoom}`;
  });

  btnClearAll.addEventListener("click", async () => {
    if (confirm("Are you sure you want to delete ALL items in this room?")) {
      await fetch(`/api/items?room=${currentRoom}`, { method: "DELETE" });
    }
  });

  // Socket Events
  socket.on("connect", () => {
    statusIndicator.className = "status online";
    if (appScreen.classList.contains("hidden") === false)
      socket.emit("join", currentRoom);
  });
  socket.on("disconnect", () => {
    statusIndicator.className = "status reconnecting";
    statusText.textContent = "Disconnected";
  });
  socket.on("presence:update", (count) => {
    statusText.textContent = `${count} connected`;
  });
  socket.on("item:created", (item) => {
    loadItems();
    if (item.device_name !== deviceName) {
      showToast(`New ${item.type} from ${item.device_name}`);
    }
  });
  socket.on("item:deleted", () => loadItems());
  socket.on("room:cleared", () => loadItems());

  // Utils
  function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  window.showToast = (msg) => {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = msg;
    document.getElementById("toast-container").appendChild(toast);
    setTimeout(() => {
      toast.classList.add("hide");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  window.previewImage = (src) => {
    previewContainer.innerHTML = `<img src="${src}" alt="Preview">`;
    previewModal.classList.remove("hidden");
  };

  closePreview.addEventListener("click", () =>
    previewModal.classList.add("hidden"),
  );

  // QR Modal
  btnQr.addEventListener("click", () => {
    qrRoomName.textContent = currentRoom;
    const url =
      window.location.origin +
      (currentRoom === "public" ? "/" : "/r/" + currentRoom);
    QRCode.toCanvas(qrCanvas, url, { width: 200, margin: 1 }, (error) => {
      if (error) console.error(error);
      qrModal.classList.remove("hidden");
    });
  });

  closeQr.addEventListener("click", () => qrModal.classList.add("hidden"));

  btnNewRoom.addEventListener("click", () => {
    const randomRoom = Math.random().toString(36).substring(2, 8);
    window.location.href = `/r/${randomRoom}`;
  });

  // Handle SPA History API for rooms (if they navigated directly)
  window.addEventListener("popstate", () => {
    currentRoom = getRoom();
    roomBadge.textContent = `Room: ${currentRoom}`;
    socket.emit("join", currentRoom);
    loadItems();
  });

  // Web Share Target API Support
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Check if there are shared files waiting
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data.action === "share") {
          const files = event.data.files;
          const text = event.data.text;
          if (files && files.length > 0) {
            document.querySelector('[data-target="tab-file"]').click();
            uploadFiles(files);
          } else if (text) {
            document.querySelector('[data-target="tab-text"]').click();
            textInput.value = text;
          }
        }
      });
    });
  }

  init();
});
