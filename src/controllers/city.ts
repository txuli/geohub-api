import { type Request, type Response, type NextFunction, json } from "express";
import connection, { redisClient } from "../config/db"
import City from "../models/city";
import type { Filter } from "../types/requests";
import type { response } from "../types/requests";
import Country from "../models/country";
import { getCityFromWiki } from "../wikiQueries/queries";
import { Alert, Debug } from "../utils/logger";
import { Info } from "../utils/logger";
import { Error } from "../utils/logger";
import { log } from 'discord-logify';
const logger = new log()
const nearme = async (req: Request, res: Response, next: NextFunction) => {
    const maxDistance = req.query.max ? req.query.max : 100000
    const ip = req.ip?.replace(/^::ffff:/, '') ?? ''
    if (!ip || ip === '127.0.0.1' || ip === '::1') {
        return res.status(400).json({ error: "Could not determine your IP address" })
    }
    const coords = await fetch('http://ip-api.com/json/' + ip, {
        headers: {
            'User-Agent': 'curl/7.79.1'
        }
    })

    const coordsResponse = (await coords.json()) as response
    if (!coordsResponse.lat || !coordsResponse.lon) {
        return res.status(400).json({ error: "Could not resolve location for your IP" })
    }

    connection

    const result = await City.find({
        location: {
            $near: {
                $geometry: {
                    type: "Point",
                    coordinates: [coordsResponse.lon, coordsResponse.lat]
                },
                $maxDistance: maxDistance
            }
        }
    }, { country: 0, _id: 0, updateTime: 0 }).limit(5).lean();

    return res.json(result)
}
const getRandomCities = async (req: Request, res: Response, next: NextFunction) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 1, 50);
    try {
        await connection;
        const count = await City.countDocuments();
        const result = await City.aggregate([
            { $sample: { size: limit } },
            { $project: { cityLabel: 0, _id: 0, updateTime: 0  } }
        ]);
        return res.json(limit === 1 ? result[0] : result);
    } catch (error) {
        return res.status(500).send("server error");
    }
}

const getCity = async (req: Request, res: Response, next: NextFunction) => {

    connection
    let filter: Filter = {}
    let city = req.query.city as string
    let country = req.query.country as string
    let minPopulation = Number(req.query.minPopulation)
    let maxPopulation = Number(req.query.maxPopulation)
    let pageSize = Number(req.query.pageSize)
    let page = Number(req.query.page)
    if (Number.isNaN(page)) page = 1
    if (pageSize > 1000 || Number.isNaN(pageSize)) pageSize = 1000
    let id = `key=${city ?? ""}-${country ?? ""}`
    //const reply = await client.get(id)
    // if (reply) return res.json(reply)
    let countryId
    let wikiRs
    try {

        if (!country) {
            return res.status(301).json("country required")
        }
        country = country.toLowerCase().trim();
        countryId = await Country.findOne(
            { CountryLabel: country },
            { _id: 1, wikiId: 1 }
        ).lean();
        filter.country = countryId?._id
        if (city) {
            city = city.toLowerCase().trim();
            filter.cityLabel = city
        }
        if (!Number.isNaN(minPopulation)) {
            filter.population = { ...(filter.population ?? {}), $gte: minPopulation };
        }

        if (!Number.isNaN(maxPopulation)) {
            filter.population = { ...(filter.population ?? {}), $lte: maxPopulation };
        }
        const result = await City.find(filter, { country: 0, _id: 0, updateTime: 0 , fullData:0}).limit(pageSize)
            .skip((page - 1) * pageSize);
        /* if is outdated the data it update from the wiki */
        if (result[0]?.updateTime != null && result[0]?.updateTime < new Date()) {
            logger.Info(`updating ${result[0]?.city}`)
            wikiRs = await getCityFromWiki(countryId?.wikiId || "", city.charAt(0).toUpperCase() + city.slice(1));
            const date = new Date();
            date.setFullYear(date.getFullYear() + 1);
            try {
                await City.updateOne({ _id: result[0]._id }, {
                    population: wikiRs?.population,
                    updateTime: date

                })
            } catch (error) {
                logger.Error(`fatal error updating ${result[0]?.city}`)
            }
        }
        //if there is not a response of an existing city in the db find the data on wiki
        if (result.length == 0) {

            wikiRs = await getCityFromWiki(countryId?.wikiId || "", city.charAt(0).toUpperCase() + city.slice(1));

            const insert = await City.insertOne({
                cityLabel: wikiRs?.cityLabel.toLocaleLowerCase(),
                country: countryId?._id,
                location: {
                    type: "Point",
                    coordinates: [wikiRs?.lon ?? 0, wikiRs?.lat ?? 0]
                },
                population: wikiRs?.population

            })
            Info(`the info of ${wikiRs?.cityLabel} has been added into db`)
            Debug(`has been served info of ${wikiRs?.cityLabel}`)
        }

        logger.Info(`the info of ${id} has been served`)
        // await client.set(id, JSON.stringify(result))
        return res.json(result)
    } catch (error) {
        Error("unexperted error:" + error)
        return res.status(500).json(error)
    }




}





export default { nearme, getCity, getRandomCities }


