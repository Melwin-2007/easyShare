# Universal Share

A self-hosted, real-time web application to share text, documents, and media seamlessly across devices on the same network or the internet. Works like a personal AirDrop directly in your browser.

## Features

- **Real-Time Sync**: Instant updates across all devices via WebSockets.
- **File Uploads**: Drag-and-drop, multiple files, large file support via streaming.
- **Text & Clipboard**: Paste text or images directly.
- **Rooms Support**: Use `/r/room-code` to keep shares isolated.
- **PWA & Share Target**: Installable on mobile, share directly from your phone's OS.
- **Security & Privacy**: Optional app password, completely self-hosted, SQLite backend.

## How to Run Locally (Development)

1. Clone or open the folder.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and adjust the settings (optional).
   ```bash
   cp .env.example .env
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Look at the console. It will print your local network IP:
   ```text
   Universal Share app running!
   - Local:   http://localhost:3000
   - Network: http://192.168.1.50:3000
   ```
6. Open the `Network` URL on your phone browser while connected to the same Wi-Fi.

## How to Deploy with Docker (Recommended for VPS/Raspberry Pi)

You can easily deploy Universal Share on a VPS (like DigitalOcean, Hetzner, AWS) or a home server (like a Raspberry Pi) using Docker.

1. Ensure Docker and Docker Compose are installed.
2. Clone this repository.
3. Configure `.env` with an `APP_PASSWORD`.
4. Run:
   ```bash
   docker-compose up -d
   ```
5. The application will be running on port 3000. Data will be saved persistently in the `./data` and `./uploads` directories on your host machine.

## Deploying behind HTTPS (Nginx/Caddy)

If you are exposing this to the internet, it is strongly recommended to use a reverse proxy with SSL (HTTPS) to secure logins and data transfers.

### Example Caddyfile:

```caddyfile
share.yourdomain.com {
    reverse_proxy localhost:3000
}
```

### Example Nginx Config:

```nginx
server {
    listen 80;
    server_name share.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

> **Note on Serverless Hosts (Vercel, Netlify):**  
> Universal Share requires a persistent file system and a long-running Node.js process for SQLite and WebSockets. Serverless environments are read-only or temporary, so **this app will not work on Vercel or Netlify.** Use a traditional VPS, Railway with a volume attached, or Render with a persistent disk.

## Backing up Data

All persistent data is stored in two directories at the root of the app:

- `./data/share.db` (SQLite Database)
- `./uploads/` (Uploaded Files)

To back up your instance, simply zip or copy these two folders. To restore, place them back before starting the app.
