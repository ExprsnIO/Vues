#!/bin/bash
# Download sample videos from alternative sources

DATA_DIR="/Users/rickholland/Projects/Vues/data/videos/samples"
mkdir -p "$DATA_DIR"

echo "Downloading sample videos to $DATA_DIR..."
echo ""

# Download function with retry
download_video() {
  local url="$1"
  local output="$2"
  local name="$3"

  if [ -f "$output" ] && [ $(stat -f%z "$output" 2>/dev/null || stat -c%s "$output" 2>/dev/null) -gt 10000 ]; then
    echo "Already exists: $name ($(du -h "$output" | cut -f1))"
    return 0
  fi

  echo "Downloading: $name"
  curl -L -o "$output" "$url" --progress-bar --fail
  if [ $? -eq 0 ] && [ -f "$output" ] && [ $(stat -f%z "$output" 2>/dev/null || stat -c%s "$output" 2>/dev/null) -gt 10000 ]; then
    echo "Downloaded: $name ($(du -h "$output" | cut -f1))"
    return 0
  else
    echo "Failed to download: $name"
    rm -f "$output"
    return 1
  fi
}

# Blender Foundation films - multiple mirror sources
# Big Buck Bunny (2008) - 10 min, 158MB 720p
download_video \
  "https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4" \
  "$DATA_DIR/BigBuckBunny.mp4" \
  "Big Buck Bunny (320x180)"

# Sintel (2010) - 15 min
download_video \
  "https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4" \
  "$DATA_DIR/Sintel.mp4" \
  "Sintel Trailer (480p)"

# Tears of Steel (2012)
download_video \
  "https://download.blender.org/mango/download.blender.org/demo/movies/ToS/tears_of_steel_720p.mkv" \
  "$DATA_DIR/TearsOfSteel.mkv" \
  "Tears of Steel (720p)" || \
download_video \
  "http://ftp.nluug.nl/pub/graphics/blender/demo/movies/ToS/tears_of_steel_720p.mov" \
  "$DATA_DIR/TearsOfSteel.mov" \
  "Tears of Steel (720p mov)"

# Elephant's Dream (2006)
download_video \
  "https://download.blender.org/ED/ED_HD.avi" \
  "$DATA_DIR/ElephantsDream.avi" \
  "Elephant's Dream HD" || \
download_video \
  "http://ftp.nluug.nl/pub/graphics/blender/demo/movies/ED/ED_1024.avi" \
  "$DATA_DIR/ElephantsDream.avi" \
  "Elephant's Dream 1024"

# Alternative test videos from other sources
# Test pattern videos
download_video \
  "https://www.w3schools.com/html/mov_bbb.mp4" \
  "$DATA_DIR/TestVideo1.mp4" \
  "Test Video 1 (W3Schools BBB clip)"

download_video \
  "https://www.w3schools.com/html/movie.mp4" \
  "$DATA_DIR/TestVideo2.mp4" \
  "Test Video 2 (W3Schools)"

# Sample video from Mux
download_video \
  "https://stream.mux.com/VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU/low.mp4" \
  "$DATA_DIR/MuxSample.mp4" \
  "Mux Sample Video"

echo ""
echo "Download complete!"
echo ""
echo "Files in $DATA_DIR:"
ls -lh "$DATA_DIR"
