/*
 * Poggit-Delta
 *
 * Copyright (C) 2018-2019 Poggit
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import {RouteHandler} from "../router"
import {Response} from "express"
import {emitUrlEncoded, errorPromise} from "../../shared/util"
import {randomBytes} from "crypto"
import {RenderParam, SessionInfo} from "../../view"
import {secrets} from "../secrets"
import {PoggitRequest, PoggitResponse} from "../ext"
import {ErrorRenderParam} from "../../view/error.view"

export const utilMiddleware: RouteHandler = async(req, res) => {
	req.getHeader = function(this: PoggitRequest, name: string): string | undefined{
		const ret = req.headers[name.toLowerCase()]
		if(typeof ret === "string"){
			return ret
		}
		if(typeof ret !== "object"){
			return undefined
		}
		return ret[0]
	}

	req.getHeaders = function(this: PoggitRequest, name: string): string[]{
		const ret = this.headers[name.toLowerCase()]
		if(typeof ret === "string"){
			return [ret]
		}
		if(typeof ret !== "object"){
			return []
		}
		return ret
	}

	req.requestId = req.getHeader("cf-ray") ||
		(await errorPromise<Buffer>(cb => randomBytes(8, cb))).toString("hex")

	req.requestAddress = req.getHeader("cf-connecting-ip") ||
		req.getHeader("x-forwarded-for") ||
		req.connection.remoteAddress || ""

	req.outFormat = (req.accepts("html", "json") as "html" | "json" | undefined) || "html"
	if(req.query.format === "json"){
		req.outFormat = "json"
	}

	res.pug = async function(this: Response, name: string, param: RenderParam){
		param.meta.url = param.meta.url || `${secrets.domain}${req.path}`
		const html = await errorPromise<string>(cb => this.render(name, param, cb))
		this.send(html)
		return html
	}

	res.mux = async function(this: PoggitResponse, formats){
		switch(req.outFormat){
			case "html":
				if(formats.html){
					const {name, param} = formats.html()
					await this.pug(name, param)
				}else{
					this.status(406)
					await this.pug("error", new ErrorRenderParam({
						title: "406 Not Acceptable",
						description: "Webpage response is not supported",
					}, SessionInfo.create(req)))
				}
				return
			case "json":
				if(formats.json){
					const type = formats.json()
					this.send(JSON.stringify(type))
				}else{
					this.status(406)
					this.send(JSON.stringify({error: "406 Not Acceptable: JSON response is not supported"}))
				}
				return
			default:
				throw new Error("Unexpected control flow")
		}
	}

	res.redirectParams = function(this: Response, url: string, args: {[name: string]: any}){
		this.redirect(url + (url.endsWith("?") ? "" : "?") + emitUrlEncoded(args))
	}

	return true
}
