FROM node:18-slim

# Install system dependencies for Puppeteer/WhatsApp
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    google-chrome-stable \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Add Chrome signing key (if not already handled by apt-get install above)
# Usually google-chrome-stable handles this, but we include it for robustness

# Create a non-root user for Hugging Face
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Copy package files and install
COPY --chown=user package*.json ./
RUN npm install

# Copy source code with correct permissions
COPY --chown=user . .

# Create necessary directories and ensure they are writable
RUN mkdir -p uploads .wwebjs_auth public && chmod -R 777 uploads .wwebjs_auth public

# Port for Hugging Face Spaces
EXPOSE 7860

# Set production env
ENV NODE_ENV=production

# Command to run the app
CMD [ "node", "server.js" ]
