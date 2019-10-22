const {Plugin} = require("powercord/entities")
const webpack = require("powercord/webpack")
const {getModuleByDisplayName, getModule, React} = webpack
const {ContextMenu: {Button}} = require("powercord/components")
const {inject, uninject} = require("powercord/injector")

function checkImage(url) {
	return new Promise((resolve, reject) => {
		const image = document.createElement("img")
		image.onerror = () => {
			cleanup()
			reject(image)
		}
		image.onload = () => {
			cleanup()
			resolve(image)
		}
		image.src = url
		image.style.display = "none"
		document.body.appendChild(image)
		function cleanup() {
			image.remove()
		}
	})
}

class ModuleStore extends Map {
	constructor(items) {
		super()
		this.inprogress = []
		if (items) {
			items.forEach(item => {
				this.fetch(item[0], item[1], item[2])
			})
		}
	}

	fetch(property, modules, save) {
		if (!modules) modules = property
		if (!save) save = property
		if (typeof modules === "string") modules = [modules]
		const promise = getModule(modules)
		this._fetchGeneric(promise, save, result => result[property])
	}

	fetchClass(property, modules, save) {
		if (!modules) modules = property
		if (!save) save = property
		if (typeof modules === "string") modules = [modules]
		const promise = getModule(modules)
		this._fetchGeneric(promise, save, result => result[property].split(" ")[0])
	}

	fetchByDisplayName(displayName, save) {
		if (!save) save = displayName
		const promise = getModuleByDisplayName(displayName)
		this._fetchGeneric(promise, save, result => result)
	}

	_fetchGeneric(promise, save, transform) {
		this.inprogress.push(promise)
		promise.then(result => {
			this.inprogress.splice(this.inprogress.indexOf(promise), 1)
			this.set(save, transform(result))
		})
	}

	wait() {
		return Promise.all(this.inprogress)
	}
}

module.exports = class StoreImage extends Plugin {
	constructor() {
		super()
	}

	async startPlugin() {
		this.modules = new ModuleStore()
		this.modules.fetch("addFavoriteGIF")
		this.modules.fetchClass("imageWrapper")
		this.modules.fetchByDisplayName("MessageContextMenu")
		this.modules.fetchByDisplayName("NativeContextMenu")
		await this.modules.wait()

		this.registerCommand(
			"storeimage",
			[],
			"Save an image to the GIF picker.",
			"{c} <image_url>",
			async (args) => {
				const url = args[0]
				try {
					new URL(url)
				} catch (e) {
					return {
						send: false,
						result: "You must provide a URL to save."
					}
				}
				return checkImage(url).then(img => {
					this.modules.get("addFavoriteGIF")({
						format: "IMAGE",
						url: img.src,
						src: img.src,
						width: img.width,
						height: img.height
					})
					return {
						send: false,
						result: "Image stored!"
					}
				}).catch(() => {
					return {
						send: false,
						result: "The URL could not be loaded as an image."
					}
				})
			}
		)

		this.runInjects()
	}

	runInjects() {
		const _this = this

		function injection(_, res) {
			const {target} = this.props;
			if (target.tagName.toLowerCase() === "img" && target.parentElement.classList.contains(_this.modules.get("imageWrapper"))) {
				/* NativeContextMenu's children is a single object, turn it in to an array to be able to push */
				if (typeof res.props.children === 'object' && !(res.props.children instanceof Array)) {
					const children = [];
					children.push(res.props.children);

					res.props.children = children;
				}

				res.props.children.push(
					React.createElement(Button, {
						name: "Add to GIF picker",
						seperate: true,
						onClick: () => {
							checkImage(target.parentElement.href).then(img => {
								_this.modules.get("addFavoriteGIF")({
									format: "IMAGE",
									url: img.src,
									src: img.src,
									width: img.width,
									height: img.height
								})
							})
						}
					})
				);
			}
			return res;
		}

		inject("store-image-messageContext", this.modules.get("MessageContextMenu").prototype, "render", injection)
		inject("store-image-nativeContext", this.modules.get("NativeContextMenu").prototype, "render", injection)
	}

	pluginWillUnload() {
		uninject("store-image-messageContext")
		uninject("store-image-nativeContext")
	}
}
