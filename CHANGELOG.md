# [1.5.0](https://github.com/bakaschwarz/cla-linker/compare/v1.4.0...v1.5.0) (2026-04-09)


### Features

* **clawd-linker-c2o:** add ignore/ig command to update .gitignore with package files ([a67034e](https://github.com/bakaschwarz/cla-linker/commit/a67034ef5d1cf995e46b0e5468fbc9398d0760e9))

# [1.4.0](https://github.com/bakaschwarz/cla-linker/compare/v1.3.0...v1.4.0) (2026-04-09)


### Features

* **sync:** add sync command to update installed packages ([7cee96c](https://github.com/bakaschwarz/cla-linker/commit/7cee96c5460f3e28dc7cf1beaa95b12062099eae))

# [1.3.0](https://github.com/bakaschwarz/cla-linker/compare/v1.2.0...v1.3.0) (2026-04-09)


### Features

* **manage:** implement content merging for Markdown files ([66f3b67](https://github.com/bakaschwarz/cla-linker/commit/66f3b676aacf7e11ee82516cba8c701d8d144673))

# [1.2.0](https://github.com/bakaschwarz/cla-linker/compare/v1.1.0...v1.2.0) (2026-04-09)


### Features

* **manage:** implement package load order and priority management ([6b27378](https://github.com/bakaschwarz/cla-linker/commit/6b2737882bdb788a43b0e813ed024c2a2d4b0a1c))

# [1.1.0](https://github.com/bakaschwarz/cla-linker/compare/v1.0.0...v1.1.0) (2026-04-08)


### Features

* rename project to cla-linker and add logo ([d5865e9](https://github.com/bakaschwarz/cla-linker/commit/d5865e9443cc80cbbb3a13a8386bdf7ab15f0775))

# 1.0.0 (2026-04-08)


### Bug Fixes

* **01:** CR-01 prevent path traversal in new command via name sanitization ([82fd3bf](https://github.com/bakaschwarz/cla-linker/commit/82fd3bff6c05b2ecd628515dde1c65c599fda37a))
* **01:** WR-01 use timestamped backup name to avoid clobbering existing backup ([1a33504](https://github.com/bakaschwarz/cla-linker/commit/1a33504ec813bd339cfe459a07a612dcc39dcc8d))
* **01:** WR-02 wrap install/uninstall loops in try/catch to accumulate errors ([95aaccf](https://github.com/bakaschwarz/cla-linker/commit/95aaccf34f0b1b6f74822a76bd3015b5e3d5fcf1))
* **01:** WR-03 replace access() with lstat+isDirectory() for directory checks ([8ad4d2c](https://github.com/bakaschwarz/cla-linker/commit/8ad4d2c4582006279fc48f8443041aa0ee485fda))
* **02:** CR-01 fix path-prefix check in cleanEmptyDirs to use separator boundary ([c46a099](https://github.com/bakaschwarz/cla-linker/commit/c46a099320c5343ae5938f87b1d36f00107f2097))
* **02:** WR-01 guard out-of-tree linkPath in reconcileLinks ([c229c97](https://github.com/bakaschwarz/cla-linker/commit/c229c9761451b0b9c676294fc2f2834fc1cbbd63))
* **02:** WR-02 use segment-aware path traversal check in new command ([a929fde](https://github.com/bakaschwarz/cla-linker/commit/a929fdef13cff7825c4d61cea6cc220678dcd68e))
* **02:** WR-03 read version from package.json instead of hardcoding ([29cec19](https://github.com/bakaschwarz/cla-linker/commit/29cec196a3859ca6526459ddb75d45eda102198a))
* **fs:** use e.parentPath for Node 21.4+ compatibility (e.path removed in Node 24) ([02ac7d2](https://github.com/bakaschwarz/cla-linker/commit/02ac7d208db331b6a02ab49841adad1b067dab2f))


### Features

* **01-01:** create fs utility boundary module with walkFiles ([4d43cb0](https://github.com/bakaschwarz/cla-linker/commit/4d43cb008499a280e1a8ad2f4336f0c1de31f211))
* **01-01:** create global config module with atomic read/write ([0317fd6](https://github.com/bakaschwarz/cla-linker/commit/0317fd6c920876c81930f23195a57bae2771c72e))
* **01-01:** initialize npm package with ESM, deps, and bin stub ([11924ff](https://github.com/bakaschwarz/cla-linker/commit/11924fffe6af648602918d9c1ae2e0f40b9c0a89))
* **01-02:** create package-registry and package-state services ([84c2265](https://github.com/bakaschwarz/cla-linker/commit/84c226562e87c0829235497956b4385de711276a))
* **01-02:** create symlink-manager with install, uninstall, and conflict detection ([d29c8f5](https://github.com/bakaschwarz/cla-linker/commit/d29c8f5ff42a4dce44ad5a5d4504fb26bec8b2d9))
* **01-03:** implement init and new commands ([2ec3506](https://github.com/bakaschwarz/cla-linker/commit/2ec350693c9ecb826432d3a89adf5f5a9ab58c32))
* **01-03:** implement manage command and wire CLI entry point ([3bf024c](https://github.com/bakaschwarz/cla-linker/commit/3bf024c4f04f65ddb444d441fef3ce37a32b65ad))
* **02-01:** add dry-run option and cleanEmptyDirs to symlink-manager ([32b8519](https://github.com/bakaschwarz/cla-linker/commit/32b8519aa94e9ebd13e9bff26216f99f338b9c1e))
* **02-01:** wire --dry-run, --yes, and headless mode into manage command ([a315c72](https://github.com/bakaschwarz/cla-linker/commit/a315c72c4b7083733fc229808cb02912fa974d61))
* **02-02:** add list command and schema version forward-compat guards ([b04c3cf](https://github.com/bakaschwarz/cla-linker/commit/b04c3cfc566316afc17ef9943ca057e7e94d869b))
* **02-02:** add reconcileLinks to package-state.js and wire into manage.js startup ([7075572](https://github.com/bakaschwarz/cla-linker/commit/70755727bb989935cf4f153c42f2551f4cd7a315))
* rewrite tool in typescript ([55ea415](https://github.com/bakaschwarz/cla-linker/commit/55ea415b33ab07ed4b40cb04b7c20db6b8678b99))
