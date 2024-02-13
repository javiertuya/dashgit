#!/bin/bash
# Prepares the distribution for release and set version number

# Ensure this script is running in his folder
SCRIPT_DIR=$(readlink -f $0 | xargs dirname)
echo "run command at directory: $SCRIPT_DIR"
cd $SCRIPT_DIR

# Ensure version to set is passed as parameter
VERSION=$1
if test -z "$VERSION"; then
  echo "Required parameter: version to set"
  exit 1
fi
echo "Set version to $VERSION"

# Copy app files to dist and set version numbers (in index.html and *.js to prevent cache problems)
rm -rf ./dist/
cp -rf ./app ./dist
find ./dist/*.js -type f -exec sed -i "s/.js\"/.js\?v=${VERSION}\"/g" {} \;
sed -i "s/IndexController.js/IndexController.js?v=${VERSION}/g" dist/index.html
sed -i "s/v0.0.0-local/${VERSION}/g" dist/index.html
