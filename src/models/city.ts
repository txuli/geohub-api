import mongoose from "mongoose";

const citySchema = new mongoose.Schema(

    {
        city: {
            type: String,
            require: true
        },
        country: {
            type: mongoose.Schema.Types.ObjectId,
            require: true
        },
        location: {
            type: {
                type: String, // Don't do `{ location: { type: String } }`
                enum: ['Point'], // 'location.type' must be 'Point'
                required: true,

            },
            coordinates: {
                type: [Number], // [lng, lat]
                required: true
            }
        },
         cityLabel:{
            type: String,
            require:true
        },
         population:{
            type: Number,
            require:true
        },
        updateTime:{
            type:Date,
            default: new Date()
        }
    }
)
citySchema.index({ location: '2dsphere' })
const City = mongoose.model("cities", citySchema, "Cities");


export default City;