/******************************************************************
 * ELASTICSEARCH INTEGRATION
 *****************************************************************/

var elasticsearch_distance_units = ["km", "mi", "miles", "in", "inch", "yd", "yards", "kilometers", "mm", "millimeters", "cm", "centimeters", "m", "meters"]

function optionsFromQuery(query) {

    function stripDistanceUnits(val) {
        for (var i=0; i < elasticsearch_distance_units.length; i=i+1) {
            var unit = elasticsearch_distance_units[i]
            if (endsWith(val, unit)) {
                return val.substring(0, val.length - unit.length)
            }
        }
        return val
    }
    
    var opts = {}
    
    // from position
    if (query.from) { opts["from"] = query.from }
    
    // page size
    if (query.size) { opts["page_size"] = query.size }
    
    if (query["sort"]) { opts["sort"] = query["sort"] }
    
    // get hold of the bool query if it is there
    // and get hold of the query string and default operator if they have been provided
    if (query.query) {
        var sq = query.query
        var must = []
        var qs = undefined
        
        // if this is a filtered query, pull must and qs out of the filter
        // otherwise the root of the query is the query_string object
        if (sq.filtered) {
            must = sq.filtered.filter.bool.must
            qs = sq.filtered.query
        } else {
            qs = sq
        }
        
        // go through each clause in the must and pull out the options
        if (must.length > 0) {
            opts["_active_filters"] = {}
            opts["_selected_operators"] = {}
        }
        for (var i = 0; i < must.length; i++) {
            var clause = must[i]
            
            // could be a term query (implies AND on this field)
            if ("term" in clause) {
                for (var field in clause.term) {
                    if (clause.term.hasOwnProperty(field)) {
                        opts["_selected_operators"][field] = "AND"
                        var value = clause.term[field]
                        if (!(field in opts["_active_filters"])) {
                            opts["_active_filters"][field] = []
                        }
                        opts["_active_filters"][field].push(value)
                    }
                }
            }
            
            // could be a terms query (implies OR on this field)
            if ("terms" in clause) {
                for (var field=0; field < clause.terms.length; field=field+1) {
                    opts["_selected_operators"][field] = "OR"
                    var values = clause.terms[field]
                    if (!(field in opts["_active_filters"])) {
                        opts["_active_filters"][field] = []
                    }
                    opts["_active_filters"][field] = opts["_active_filters"][field].concat(values)
                }
            }
            
            // could be a range query
            if ("range" in clause) {
                for (var field=0; field < clause.range.length; field=field+1) {
                    var rq = clause.range[field]
                    var range = {}
                    if (rq.lt) { range["to"] = rq.lt }
                    if (rq.gte) { range["from"] = rq.gte }
                    opts["_active_filters"][field] = range
                }
            }
            
            // cound be a geo distance query
            if ("geo_distance_range" in clause) {
                var gdr = clause.geo_distance_range
                
                // the range is defined at the root of the range filter
                var range = {}
                if ("lt" in gdr) { range["to"] = stripDistanceUnits(gdr.lt) }
                if ("gte" in gdr) { range["from"] = stripDistanceUnits(gdr.gte) }
                
                // FIXME: at some point we may need to make this smarter, if we start including other data
                // in the geo_distance_range filter definition
                // then we have to go looking for the field name
                for (var field=0; field < gdr.length; field=field+1) {
                    if (field === "lt" || field === "gte") { continue }
                    opts["_active_filters"][field] = range
                    break
                }
            }

            // FIXME: support for statistical facet and terms_stats facet
        }
        
        if (qs) {
            if (qs.query_string) {
                var string = qs.query_string.query
                var field = qs.query_string.default_field
                var op = qs.query_string.default_operator
                if (string) { opts["q"] = string }
                if (field) { opts["searchfield"] = field }
                if (op) { opts["default_operator"] = op }
            } else if (qs.match_all) {
                opts["q"] = ""
            }
        }
        
        return opts
    }
}

function getFilters(params) {
    var options = params.options

    // function to get the right facet from the options, based on the name
    function selectFacet(name) {
        for (var i = 0; i < options.facets.length; i++) {
            var item = options.facets[i];
            if ('field' in item) {
                if (item['field'] === name) {
                    return item
                }
            }
        }
    }

    function termsFilter(facet, filter_list) {
        if (facet.logic === "AND") {
            for (var i=0; i < filter_list.length; i=i+1) {
                var value = filter_list[i]
                var tq = {"term" : {}}
                tq["term"][facet.field] = value
                return tq
            }
        } else if (facet.logic === "OR") {
            var tq = {"terms" : {}}
            tq["terms"][facet.field] = filter_list
            return tq
        }
    }

    function rangeFilter(facet, value) {
        var rq = {"range" : {}}
        rq["range"][facet.field] = {}
        if (value.to) { rq["range"][facet.field]["lt"] = value.to }
        if (value.from) { rq["range"][facet.field]["gte"] = value.from }
        return rq
    }

    function geoFilter(facet, value) {
        var gq = {"geo_distance_range" : {}}
        if (value.to) { gq["geo_distance_range"]["lt"] = value.to + facet.unit }
        if (value.from) { gq["geo_distance_range"]["gte"] = value.from + facet.unit }
        gq["geo_distance_range"][facet.field] = [facet.lon, facet.lat] // note the order of lon/lat to comply with GeoJSON
        return gq
    }

    // function to make the relevant filters from the filter definition
    function makeFilters(filter_definition) {
        var filters = []
        for (var field in filter_definition) {
            if (filter_definition.hasOwnProperty(field)) {
                var facet = selectFacet(field)
                var filter_list = filter_definition[field]

                if (facet.type === "terms") {
                    filters.push(termsFilter(facet, filter_list))
                } else if (facet.type === "range") {
                    filters.push(rangeFilter(facet, filter_list))
                } else if (facet.type == "geo_distance") {
                    filters.push(geoFilter(facet, filter_list))
                }
            }
        }
        return filters
    }

    // read any filters out of the options and create an array of "must" queries which
    // will constrain the search results
    var filter_must = []
    if (options.active_filters) {
        filter_must = filter_must.concat(makeFilters(options.active_filters))
    }
    if (options.predefined_filters) {
        filter_must = filter_must.concat(makeFilters(options.predefined_filters))
    }
    if (options.fixed_filters) {
        filter_must = filter_must.concat(options.fixed_filters)
    }

    return filter_must
}

function elasticSearchQuery(params) {
    // break open the parameters
    var options = params.options
    var include_facets = "include_facets" in params ? params.include_facets : true
    var include_fields = "include_fields" in params ? params.include_fields : true

    var filter_must = getFilters({"options" : options})

    // search string and search field produce a query_string query element
    var querystring = options.q
    var searchfield = options.searchfield
    var default_operator = options.default_operator
    var ftq = undefined
    if (querystring) {
        ftq = {'query_string' : { 'query': fuzzify(querystring, options.default_freetext_fuzzify) }};
        if (searchfield) {
            ftq.query_string["default_field"] = searchfield
        }
        if (default_operator) {
            ftq.query_string["default_operator"] = default_operator
        }
    } else {
        ftq = {"match_all" : {}}
    }
    
    // if there are filter constraints (filter_must) then we create a filtered query,
    // otherwise make a normal query
    var qs = undefined
    if (filter_must.length > 0) {
        qs = {"query" : {"filtered" : {"filter" : {"bool" : {"must" : filter_must}}}}}
        qs.query.filtered["query"] = ftq;
    } else {
        qs = {"query" : ftq}
    }
    
    // sort order and direction
    options.sort && options.sort.length > 0 ? qs['sort'] = options.sort : "";
    
    // fields and partial fields
    if (include_fields) {
        options.fields ? qs['fields'] = options.fields : "";
        options.partial_fields ? qs['partial_fields'] = options.partial_fields : "";
    }
    
    // paging (number of results, and start cursor)
    if (options.from !== undefined) {
        qs["from"] = options.from
    }
    if (options.page_size !== undefined) {
        qs["size"] = options.page_size
    }
    
    // facets
    if (include_facets) {
        qs['facets'] = {};
        for (var item = 0; item < options.facets.length; item++) {
            var defn = options.facets[item]
            var size = defn.size
            
            // add a bunch of extra values to the facets to deal with the shard count issue
            size += options.elasticsearch_facet_inflation 
            
            var facet = {}
            if (defn.type === "terms") {
                facet["terms"] = {"field" : defn["field"], "size" : size, "order" : defn["order"]}
            } else if (defn.type === "range") {
                var ranges = []
                for (var r=0; r < defn["range"].length; r=r+1) {
                    var def = defn["range"][r]
                    var robj = {}
                    if (def.to) { robj["to"] = def.to }
                    if (def.from) { robj["from"] = def.from }
                    ranges.push(robj)
                }
                facet["range"] = { }
                facet["range"][defn.field] = ranges
            } else if (defn.type === "geo_distance") {
                facet["geo_distance"] = {}
                facet["geo_distance"][defn["field"]] = [defn.lon, defn.lat] // note that the order is lon/lat because of GeoJSON
                facet["geo_distance"]["unit"] = defn.unit
                var ranges = []
                for (var r=0; r < defn["distance"].length; r=r+1) {
                    var def = defn["distance"][r]
                    var robj = {}
                    if (def.to) { robj["to"] = def.to }
                    if (def.from) { robj["from"] = def.from }
                    ranges.push(robj)
                }
                facet["geo_distance"]["ranges"] = ranges
            } else if (defn.type === "statistical") {
                facet["statistical"] = {"field" : defn["field"]}
            } else if (defn.type === "terms_stats") {
                facet["terms_stats"] = {key_field : defn["field"], value_field: defn["value_field"], size : size, order : defn["order"]}
            }
            qs["facets"][defn["field"]] = facet
        }
        
        // and any extra facets
        // NOTE: this does not include any treatment of the facet size inflation that may be required
        if (options.extra_facets) {
            $.extend(true, qs['facets'], options.extra_facets );
        }
    }
    
    return qs
}

function fuzzify(querystr, default_freetext_fuzzify) {
    var rqs = querystr
    if (default_freetext_fuzzify !== undefined) {
        if (default_freetext_fuzzify == "*" || default_freetext_fuzzify == "~") {
            if (querystr.indexOf('*') === -1 && querystr.indexOf('~') === -1 && querystr.indexOf(':') === -1) {
                var optparts = querystr.split(' ');
                pq = "";
                for ( var oi = 0; oi < optparts.length; oi++ ) {
                    var oip = optparts[oi];
                    if ( oip.length > 0 ) {
                        oip = oip + default_freetext_fuzzify;
                        default_freetext_fuzzify == "*" ? oip = "*" + oip : false;
                        pq += oip + " ";
                    }
                };
                rqs = pq;
            };
        };
    };
    return rqs;
};

var elasticsearch_special_chars = ['(', ')', '{', '}', '[', ']', '^' , ':', '/'];

function jsonStringEscape(key, value) {
    if (key == "query" && typeof(value) == 'string') {
        for (var each = 0; each < elasticsearch_special_chars.length; each++) {
            value = value.replace(elasticsearch_special_chars[each],'\\' + elasticsearch_special_chars[each], 'g');
        }
        return value;
    }
    return value;
};

function serialiseQueryObject(qs) {
    return JSON.stringify(qs, jsonStringEscape);
};

// closure for elastic search success, which ultimately calls
// the user's callback
function elasticSearchSuccess(callback) {
    return function(data) {
        var resultobj = {
            "records" : [],
            "start" : "",
            "found" : data.hits.total,
            "facets" : {}
        }
        
        // load the results into the records part of the result object
        for (var item = 0; item < data.hits.hits.length; item++) {
            var res = data.hits.hits[item]
            if ("fields" in res) {
                // partial fields are also included here - no special treatment
                resultobj.records.push(res.fields)
            } else {
                resultobj.records.push(res._source)
            }
        }
        
        for (var item in data.facets) {
            if (data.facets.hasOwnProperty(item)) {
                var facet = data.facets[item]
                // handle any terms facets
                if ("terms" in facet) {
                    var terms = facet["terms"]
                    resultobj["facets"][item] = terms
                // handle any range/geo_distance_range facets
                } else if ("ranges" in facet) {
                    var range = facet["ranges"]
                    resultobj["facets"][item] = range
                // handle statistical facets
                } else if (facet["_type"] === "statistical") {
                    resultobj["facets"][item] = facet
                // handle terms_stats
                } else if (facet["_type"] === "terms_stats") {
                    var terms = facet["terms"]
                    resultobj["facets"][item] = terms
                }
            }
        }
            
        callback(data, resultobj)
    }
}

function doElasticSearchQuery(params) {
    // extract the parameters of the request
    var success_callback = params.success
    var complete_callback = params.complete
    var search_url = params.search_url
    var queryobj = params.queryobj
    var datatype = params.datatype
    
    // serialise the query
    var querystring = serialiseQueryObject(queryobj)
    
    // make the call to the elasticsearch web service
    $.ajax({
        type: "get",
        url: search_url,
        data: {source: querystring},
        dataType: datatype,
        success: elasticSearchSuccess(success_callback),
        complete: complete_callback
    });
}

