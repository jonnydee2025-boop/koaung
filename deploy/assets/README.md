# Production assets

Copy your thumbnail template here on the VPS, for example:

```bash
sudo cp thumbnail_template.jpg /opt/videobot/assets/thumbnail_template.jpg
sudo chown videobot:videobot /opt/videobot/assets/thumbnail_template.jpg
```

Set `THUMBNAIL_TEMPLATE=/opt/videobot/assets/thumbnail_template.jpg` in `/opt/videobot/.env`.
