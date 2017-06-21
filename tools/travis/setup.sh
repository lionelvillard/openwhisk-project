#!/usr/bin/env bash

echo Install bx

wget http://ftp.icap.cdl.ibm.com/OERuntime/BluemixCLIs/CliProvider/bluemix-cli/Bluemix_CLI_0.5.5_amd64.tar.gz
cd Bluemix_CLI
./install_bluemix_cli

echo npm install deployer
cd ${TRAVIS_BUILD_DIR}/libs/deployer
npm install

