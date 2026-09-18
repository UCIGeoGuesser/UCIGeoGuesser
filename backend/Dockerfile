# Stage 1: Build stage
FROM ubuntu:22.04 AS builder
 
ARG TARGETARCH
 
ENV VCPKG_ROOT=/vcpkg
ENV PATH="${VCPKG_ROOT}:${PATH}"
# Limit vcpkg build concurrency to prevent OOM/race conditions on heavy packages
ENV VCPKG_MAX_CONCURRENCY=2
 
# Install essential packages for compiling C++ code (including autoconf, bison, and flex for libpq)
RUN apt-get update && apt-get install -y \
    build-essential \
    ninja-build \
    cmake \
    git \
    curl \
    zip \
    unzip \
    tar \
    pkg-config \
    python3 \
    bison \
    flex \
    autoconf \
    automake \
    libtool \
    && rm -rf /var/lib/apt/lists/*
 
# Install vcpkg package manager
RUN git clone https://github.com/microsoft/vcpkg /vcpkg
RUN vcpkg/bootstrap-vcpkg.sh
 
# Set the working directory
WORKDIR /backend
 
# Copy the vcpkg manifest file to the container
COPY vcpkg.json .
 
# Copy the source code into the container
COPY . .
 
# Build the project using the target triplet
RUN VCPKG_TRIPLET=$( [ "$TARGETARCH" = "arm64" ] && echo "arm64-linux-release" || echo "x64-linux-release" ) && \
    cmake -B build -S . -GNinja \
    -DCMAKE_TOOLCHAIN_FILE=/vcpkg/scripts/buildsystems/vcpkg.cmake \
    -DVCPKG_MANIFEST_MODE=ON \
    -DVCPKG_ROOT=/vcpkg \
    -DVCPKG_OVERLAY_TRIPLETS=/backend/triplets \
    -DVCPKG_TARGET_TRIPLET=${VCPKG_TRIPLET} \
    -DCMAKE_BUILD_TYPE=Release
    
# Compile the application code
RUN cmake --build build --parallel 2
 
# Exposing the port that the server will run on
EXPOSE 18080
 
# STAGE 2: Creates tiny image with only the compiled binary
FROM ubuntu:22.04
 
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
 
WORKDIR /backend

COPY --from=builder /backend/build/backend .
 
EXPOSE 18080
 
CMD ["./backend"]