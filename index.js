// MIT License - Copyright (c) 2020 Stefan Arentz <stefan@devbots.xyz>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.


const fs = require('fs');

const core = require('@actions/core');
const execa = require('execa');


const parseConfiguration = () => {
    const configuration = {
        productPath: core.getInput("product-path", {required: true}),
        username: core.getInput("appstore-connect-username"),
        password: core.getInput("appstore-connect-password"),
        ascAPIKey: core.getInput("appstore-connect-api-key", {require: true}),
        ascAPIKeyID: core.getInput("appstore-connect-api-key-id", {require: true}),
        ascAPIIssuer: core.getInput("appstore-connect-api-issuer", {require: true}),
        primaryBundleId: core.getInput("primary-bundle-id"),
        verbose: core.getInput("verbose") === "true",
    };

    if (!fs.existsSync(configuration.productPath)) {
        throw Error(`Product path ${configuration.productPath} does not exist.`);
    }
    writeAppStoreConnectAPIKey(configuration)

    return configuration
};


const writeAppStoreConnectAPIKey = (configuration) => {
    const path = './appstore-connect-api-key';

    fs.writeFileSync(path, configuration.ascAPIKey)
}


const archive = async ({productPath}) => {
    const archivePath = "/tmp/archive.zip"; // TODO Temporary file

    const args = [
        "-c",           // Create an archive at the destination path
        "-k",           // Create a PKZip archive
        "--keepParent", // Embed the parent directory name src in dst_archive.
        productPath,    // Source
        archivePath,    // Destination
    ];

    try {
        await execa("ditto", args);
    } catch (error) {
        core.error(error);
        return null;
    }

    return archivePath;
};


const submit = async ({productPath, archivePath, verbose, ascAPIKeyID, ascAPIIssuer}) => {
    //
    // Make sure the product exists.
    //

    if (!fs.existsSync(productPath)) {
        throw Error(`No product could be found at ${productPath}`);
    }

    const args = [
        "notarytool", "submit",
        "--key", "./appstore-connect-api-key",
        "--key-id", ascAPIKeyID,
        "--issuer", ascAPIIssuer,
        "--wait",
        "--timeout", "15m",
    ]

    if (verbose === true) {
        args.push("--verbose");
    }
    args.push(archivePath)

    let xcrun = execa("xcrun", args, {reject: false});

    if (verbose == true) {
        xcrun.stdout.pipe(process.stdout);
        xcrun.stderr.pipe(process.stderr);
    }

    const { exitCode, stdout, stderr } = await xcrun;

    if (exitCode === 0) {
        core.info(stdout)
    } else {
        core.error(`${stdout}\n${stderr}`)
        throw Error(`${stdout}\n${stderr}`)
    }
};

const main = async () => {
    try {
        const configuration = parseConfiguration();

        const archivePath = await core.group('Archiving Application', async () => {
            const archivePath = await archive(configuration)
            if (archivePath !== null) {
                core.info(`Created application archive at ${archivePath}`);
            }
            return archivePath;
        });

        if (archivePath == null) {
            core.setFailed("Notarization failed");
            return;
        }

        await core.group('Submitting for Notarizing', async () => {
            await submit({archivePath: archivePath, ...configuration});
        });

        core.setOutput('product-path', configuration.productPath);
    } catch (error) {
        core.setFailed(`Notarization failed with an unexpected error: ${error.message}`);
    }
};


main();
