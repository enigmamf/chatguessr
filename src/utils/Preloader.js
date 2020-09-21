const fs = require("fs").promises;
const path = require("path");

class Preloader {
	static preload(files) {
		let promises = [];
		files.forEach((file) => {
			promises.push(
				fs
					.readFile(path.join(__dirname, `../components/${file}`), "utf8")
					.then((data) => data.toString())
					.catch((error) => error)
			);
		});

		return Promise.all(promises)
			.then((res) => res)
			.catch((error) => console.error("Something went wrong reading files:", error));
	}
}

module.exports = Preloader;