#!/bin/bash

# Update kernel parameters for MongoDB
echo "Updating kernel parameters for MongoDB..."

# Export rseq setting
echo "export GLIBC_TUNABLES=glibc.pthread.rseq=0" >> /etc/profile.d/mongodb-tunables.sh
source /etc/profile.d/mongodb-tunables.sh

echo "MongoDB system optimizations applied"
