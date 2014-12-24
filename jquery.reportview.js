/*
 * jquery.facetview2.js
 *
 * displays faceted browse results by querying a specified elasticsearch index
 *
 * http://cottagelabs.com
 *
 */

/*****************************************************************************
 * JAVASCRIPT PATCHES
 ****************************************************************************/

// Deal with indexOf issue in <IE9
// provided by commentary in repo issue - https://github.com/okfn/facetview/issues/18
if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function(searchElement /*, fromIndex */ ) {
        "use strict";
        if (this == null) {
            throw new TypeError();
        }
        var t = Object(this);
        var len = t.length >>> 0;
        if (len === 0) {
            return -1;
        }
        var n = 0;
        if (arguments.length > 1) {
            n = Number(arguments[1]);
            if (n != n) { // shortcut for verifying if it's NaN
                n = 0;
            } else if (n != 0 && n != Infinity && n != -Infinity) {
                n = (n > 0 || -1) * Math.floor(Math.abs(n));
            }
        }
        if (n >= len) {
            return -1;
        }
        var k = n >= 0 ? n : Math.max(len - Math.abs(n), 0);
        for (; k < len; k++) {
            if (k in t && t[k] === searchElement) {
                return k;
            }
        }
        return -1;
    }
}

function ie8compat(o) {
    // Clean up all array options
    // IE8 interprets trailing commas as introducing an undefined
    // object, e.g. ["a", "b", "c",] means ["a", "b", "c", undefined]
    // in IE8. And maybe in older IE-s. So the user loading
    // facetview might have put trailing commas in their config, but
    // this will cause facetview to break in IE8 - so clean up!

    function delete_last_element_of_array_if_undefined(array, recurse) {
        var recurse = recurse || false;
        if ($.type(array) == 'array') {
            // delete the last item if it's undefined
            if (array.length > 0 && $.type(array[array.length - 1]) == 'undefined') {
                array.splice(array.length - 1, 1);
            }
        }
        if (recurse) {
            for ( var each = 0; each < array.length; each++ ) {
                if ($.type(array[each]) == 'array') {
                    delete_last_element_of_array_if_undefined(array[each], true);
                }
            }
        }
    }

    // first see if this clean up is necessary at all
    var test = ["a", "b", "c", ];  // note trailing comma, will produce ["a", "b", "c", undefined] in IE8 and ["a", "b", "c"] in every sane browser
    if ($.type(test[test.length - 1]) == 'undefined') {
        // ok, cleanup is necessary, go
        for (var key in o) {
            if (o.hasOwnProperty(key)) {
                var option = o[key];
                delete_last_element_of_array_if_undefined(option, true);
            }
        }
    }
}

/******************************************************************
 * DEFAULT CALLBACKS AND PLUGINS
 *****************************************************************/
 
///// the lifecycle callbacks ///////////////////////
function postInit(options, context) {}
function preRender(options, context) {}
function postRender(options, context) {}

/******************************************************************
 * DEFAULT RENDER FUNCTIONS
 ******************************************************************/

function theReportview(options) {
    /*****************************************
     * overrides must provide the following classes and ids
     *
     * class: reportview - main div in which the reportview functionality goes, which should contain an svg element directly
     * 
     * Should respect the following configs
     *
     * options.debug - is this a debug enabled reportview.  If so, put a debug textarea somewhere
     */

    // the reportview object to be appended to the page
    var thereportview = '<div class="reportview"><svg></svg>';
    if (options.debug) {
        thereportview += "<div class='reportview_debug'><textarea style='width: 100%; height: 200px'></textarea></div>"
    }
    thereportview += '</div>';
    return thereportview
}

/******************************************************************
 * CHART CONVERT/RENDER FUNCTIONS
 *****************************************************************/

function hc_convertDataPie(params) {
    var hc_data_series = [];
    for (var i = 0; i < params.data_series.length; i++) {
        var os = params.data_series[i];
        var ns = {};
        ns["name"] = os["key"];
        ns["data"] = [];
        for (var j = 0; j < os.values.length; j++) {
            var data_entry = [os.values[j].label, os.values[j].value];
            ns["data"].push(data_entry)
        }
        hc_data_series.push(ns)
    }
    return hc_data_series
}

function hc_renderPie(params) {
    var data_series = params.data_series;
    var selector = params.div_selector;
    var options = params.options;
    var show_labels = options.pie_show_labels;
    var be_donut = options.pie_donut;
    var be_3d = options.draw_3d;

    // make a donut if asked to
    var inner;
    if (be_donut) {
        inner = 100
    }

    // get chart titles, if any
    var titles = get_chart_titles(params);

    // generate the pie
    var chart = new Highcharts.Chart({
        chart: {
            renderTo: selector,
            plotBackgroundColor: null,
            plotBorderWidth: null,
            plotShadow: false,
            type: 'pie',
            options3d: {
                enabled: be_3d,
                alpha: 45
            }
        },
        credits: {
            enabled: false
        },
        title: {
            text: titles.title_text
        },
        subtitle: {
            text: titles.subtitle_text
        },
        tooltip: {
            pointFormat: '<b>{point.y:' + options.tooltip_num_format + '}</b>'
        },
        plotOptions: {
            pie: {
                allowPointSelect: true,
                cursor: 'pointer',
                dataLabels: {
                    enabled: show_labels
                },
            showInLegend: true,
            innerSize: inner,
            depth: 45
            }
        },
        series : data_series
    });
}

function d3_convertDataPie(params) {
    return params.data_series
}

function d3_renderPie(params) {
    var data_series = params.data_series;
    var selector = params.svg_selector;
    var options = params.options;

    var show_labels = options.pie_show_labels;
    var label_threshold = options.pie_label_threshold;
    var be_donut = options.pie_donut;
    var transition_duration = options.pie_transition_duration;

    // set the space up for the new chart
    //$(selector).empty()

    if (options.main_title){
        if (typeof options.main_title == "string"){
            var title_text = options.main_title
        }else{
            title_text = data_series[0].key
        }
        d3.select(selector)
            .append("text")
            .attr("x", $(selector).width() / 2)
            .attr("y", $(selector).height() - 5)
            .style("font-size", '18px')
            .attr("text-anchor", "middle")
            .text(title_text);
    }

    // generate the pie
    nv.addGraph(function() {
        var chart = nv.models.pieChart()
            .x(function(d) { return d.label })
            .y(function(d) { return d.value })
            .showLabels(show_labels)
            .labelThreshold(label_threshold)
            .donut(be_donut);

        d3.select(selector)  // FIXME: how to do d3 selector within context
            .datum(data_series)
            .transition().duration(transition_duration)
            .call(chart);

        return chart;
    });
}

function hc_convertMultiBar(params){
    var hc_data_series = [];
    var x_labels = {"categories": []};
    hc_data_series.push(x_labels);
    for (var i = 0; i < params.data_series.length; i++) {
        var os = params.data_series[i];
        var ns = {};
        ns["name"] = os["key"];
        ns["data"] = [];
        for (var j = 0; j < os.values.length; j++) {
            x_labels.categories.push(os.values[j].label);
            ns.data.push(os.values[j].value);
        }
        hc_data_series.push(ns)
    }
    return hc_data_series
}

function hc_renderMultiBar(params){
    var data_series = params.data_series;
    var selector = params.div_selector;
    var options = params.options;
    var be_3d = options.draw_3d;

    // get chart titles, if any
    var titles = get_chart_titles(params);

    // Switch to horizontal type if required
    var chart_type = 'column';
    if (options.type == 'horizontal_multibar'){
        chart_type = 'bar'
    }

    var chart = new Highcharts.Chart({
        chart: {
            renderTo: selector,
            type: chart_type,
            options3d: {
                enabled: be_3d,
                alpha: 15,
                beta: 15,
                depth: 50,
                viewDistance: 55
            }
        },
        credits: {
            enabled: false
        },
        title: {
            text: titles.title_text
        },
        subtitle: {
            text: titles.subtitle_text
        },
        xAxis: {
            categories: data_series[0].categories,
            title: {
                text: titles.x_axis_label
            }
        },
        yAxis: {
            min: 0,
            title: {
                text: titles.y_axis_label
            }
        },
        tooltip: {
            headerFormat: '<span style="font-size:14px">{series.name}</span><br><span style="font-size:10px ">{point.key}: </span>',
            pointFormat: '<b>{point.y:' + options.tooltip_num_format + '}</b>',
            shared: true,
            useHTML: true
        },
        plotOptions: {
            column: {
                pointPadding: 0.2,
                borderWidth: 0
            }
        },
        series: data_series.slice(1)
    });
}

function d3_convertMultiBar(params) {
    var series = params.data_series;
    var new_series = [];
    for (var i = 0; i < series.length; i++) {
        var os = series[i];
        var ns = {};
        ns["key"] = os["key"];
        ns["values"] = [];
        for (var j = 0; j < os.values.length; j++) {
            var vector = os.values[j];
            ns["values"].push({x : vector.label, y : vector.value})
        }
        new_series.push(ns)
    }
    return new_series
}

function d3_renderMultiBar(params) {
    var data_series = params.data_series;
    var selector = params.svg_selector;
    var options = params.options;
    
    var y_tick_format = params.multibar_y_tick_format;
    var transition_duration = params.multibar_transition_duration;
    var controls = options.multibar_controls;
    
    // set the space up for the new chart
    //$(selector).empty()
    
    nv.addGraph(function() {
        var chart = nv.models.multiBarChart()
            .showControls(controls);

        chart.yAxis
            .tickFormat(d3.format(y_tick_format));

        d3.select(selector)
          .datum(data_series)
          .transition().duration(transition_duration).call(chart);

        nv.utils.windowResize(chart.update);

        return chart;
    });
}

function hc_convertHorizontalMultibar(params){
    return hc_convertMultiBar(params)
}

function hc_renderHorizontalMultibar(params){
    hc_renderMultiBar(params)
}

function d3_convertHorizontalMultiBar(params) {
    return params.data_series
}

function d3_renderHorizontalMultiBar(params) {
    var data_series = params.data_series;
    var selector = params.svg_selector;
    var options = params.options;

    var show_values = options.horizontal_multibar_show_values;
    var tool_tips = options.horizontal_multibar_tool_tips;
    var controls = options.horizontal_multibar_controls;
    var y_tick_format = options.horizontal_multibar_y_tick_format;
    var transition_duration = options.horizontal_multibar_transition_duration;

    var margin_top = options.horizontal_multibar_margin_top;
    var margin_right = options.horizontal_multibar_margin_right;
    var margin_bottom = options.horizontal_multibar_margin_bottom;
    var margin_left = options.horizontal_multibar_margin_left;

    // set the space up for the new chart
    //$(selector).empty()

    nv.addGraph(function() {
        var chart = nv.models.multiBarHorizontalChart()
            .x(function(d) { return d.label })
            .y(function(d) { return d.value })
            .margin({top: margin_top, right: margin_right, bottom: margin_bottom, left: margin_left})
            .showValues(show_values)
            .tooltips(tool_tips)
            .showControls(controls);

        chart.yAxis
            .tickFormat(d3.format(y_tick_format));

        d3.select(selector)
            .datum(data_series)
            .transition().duration(transition_duration)
            .call(chart);

        nv.utils.windowResize(chart.update);

        return chart;
    });
}

function get_chart_titles(params){
    var options = params.options;
    var data_series = params.data_series;
    var titles = {};

    titles['title_text'] = "";
    if (options.main_title){
        if (options.main_title == true){
            titles.title_text = data_series[0].name
        } else {
            titles.title_text = options.main_title
        }
    }
    // get subtitle if required
    titles['subtitle_text'] = "";
    if (options.sub_title){
        titles.subtitle_text = options.sub_title
    }
    // axis labels
    titles['y_axis_label'] = "";
    if (options.y_axis_label){
        titles.y_axis_label = options.y_axis_label
    }
    titles['x_axis_label'] = "";
    if (options.x_axis_label){
        titles.x_axis_label = options.x_axis_label
    }
    return titles
}

/******************************************************************
 * REPORT VIEW
 *****************************************************************/

(function($){
    $.fn.report = function(options) {
        var defaults = {
            // debug on or off
            "debug" : false,
            
            // type of graph to draw
            // values: pie, multibar, horizontal_multibar
            "type" : "pie",

            // the provider of the charts. either d3 or hc (for HighCharts)
            "provider" : "hc",

            // highcharts can make 3d charts
            "draw_3d" : false, // hc only
            
            // render the frame within which the reportview sits
            "render_the_reportview" : theReportview,
            
            // convert/render functions for pie chart
            "pie_render" : hc_renderPie,
            "pie_convert" : hc_convertDataPie,
            "pie_show_labels" : true,
            "pie_donut" : false,
            "pie_label_threshold" : 0.05, // d3 only
            "pie_transition_duration" : 500, // d3 only
            
            // convert/render functions for multi-bar chart
            "multibar_render" : hc_renderMultiBar,
            "multibar_convert" : hc_convertMultiBar,
            "multibar_y_tick_format" : ',.0f',
            "multibar_transition_duration" : 500,
            "multibar_controls" : false,
            
            // convert/render functions for horizontal bar chart
            "horizontal_multibar_render" : hc_renderHorizontalMultibar,
            "horizontal_multibar_convert" : hc_convertHorizontalMultibar,
            "horizontal_multibar_show_values" : true,
            "horizontal_multibar_tool_tips" : true,
            "horizontal_multibar_controls" : false,
            "horizontal_multibar_y_tick_format" : ',.0f',
            "horizontal_multibar_transition_duration" : 500,
            "horizontal_multibar_margin_top" : 30,
            "horizontal_multibar_margin_right": 50,
            "horizontal_multibar_margin_bottom": 30,
            "horizontal_multibar_margin_left": 200,
            
            // data from which to build the graph
            "data_series" : false,
            "data_function" : false,

            // Titles and labels
            "main_title" : false, // true for series label, or specify string
            "sub_title" :false, // hc only. specify string
            "y_axis_label" : false, // specify string
            "x_axis_label" : false, // specify string
            "tooltip_num_format" : ',.0f',
            
            ///// facet aspects /////////////////////////////
            
            // the base search url which will respond to elasticsearch queries.  Generally ends with _search
            "search_url" : "http://localhost:9200/_search",
            
            // datatype for ajax requests to use - overall recommend using jsonp
            "datatype" : "jsonp",
            
            // due to a bug in elasticsearch's clustered node facet counts, we need to inflate
            // the number of facet results we need to ensure that the results we actually want are
            // accurate.  This option tells us by how much.
            "elasticsearch_facet_inflation" : 100,
            
            // The list of facets to be displayed and used to seed the filtering processes.
            // Facets are complex fields which can look as follows:
            /*
            {
                "field" : "<elasticsearch field>"                                   // field upon which to facet
                "display" : "<display name>",                                       // display name for the UI
                "type": "term|range|geo_distance|statistical|terms_stats",          // the kind of facet this will be

                "facet_label_field" : "<field to use as the label for the value>"   // so in a term facet, this would be "term"
                "facet_value_field" : "<field to use as the value>"                 // in a term facet this would be "count", but in a terms_stats facet it could be "total"
                "series_function" : <function>                                      // function which takes the facet and returns one or more series

                // terms and terms_stats facets only
                
                "size" : <num>,                                                     // how many terms should the facet limit to
                "order" : "count|reverse_count|term|reverse_term",                  // which standard ordering to use for facet values
                "value_function" : <function>,                                      // function to be called on each value before display

                // terms_stats facets only

                "value_field" : "<elasticsearch field>"                             // field on which to compute the statistics

                // range facet only
                
                "range" : [                                                         // list of ranges (in order) which define the filters
                    {"from" : <num>, "to" : <num>, "display" : "<display name>"}    // from = lower bound (inclusive), to = upper boud (exclusive)
                ],                                                                  // display = display name for this range
                
                // geo distance facet only
                
                "distance" : [                                                      // list of distances (in order) which define the filters
                    {"from" : <num>, "to" : <num>, "display" : "<display name>"}    // from = lower bound (inclusive), to = upper boud (exclusive)
                ],                                                                  // display = display name for this distance
                "unit" : "<unit of distance, e.g. km or mi>"                        // unit to calculate distances in (e.g. km or mi)
                "lat" : <latitude>                                                  // latitude from which to measure distances
                "lon" : <longitude>                                                 // longitude from which to measure distances
                
                // admin use only
                
                "values" : <object>                                                 // the values associated with a successful query on this facet
            }*/
            "facets" : [],
            
            // default settings for each of the facet properties above.  If a facet lacks a property, it will
            // be initialised to the default
            "default_facet_type" : "terms",
            "default_facet_size" : 10,
            "default_facet_order" : "count",
            "default_distance_unit" : "km",
            "default_distance_lat" : 51.4768,       // Greenwich meridian (give or take a few decimal places)
            "default_distance_lon" : 0.0,           //
            "default_facet_label_field" : "term",
            "default_facet_value_field" : "count",
            
            // list of filters that will be added to the "must" boolean filter for every request
            // should take the form of a set of query elements that can be appended directly
            // to the must filter
            "fixed_filters" : false,
            
            // size of result set
            "page_size" : 0,
            
            ///// lifecycle callbacks /////////////////////////////
            
            // the default callbacks don't have any effect - replace them as needed
            
            "post_init_callback" : postInit,
            "pre_render_callback" : preRender,
            "post_render_callback" : postRender,
            
            ///// internal state monitoring /////////////////////////////
            
            // these are used internally DO NOT USE
            // they are here for completeness and documentation
            
            // the raw query object
            "queryobj" : false,
            
            // the raw data coming back from elasticsearch
            "rawdata" : false,
            
            // the parsed data from elasticsearch
            "data" : false
        };
        
        function deriveOptions() {
            // cleanup for ie8 purposes
            ie8compat(options);
            ie8compat(defaults);

            // If we want to use d3, override some options.
            if (options.provider == 'd3'){
                defaults.pie_render = d3_renderPie;
                defaults.pie_convert = d3_convertDataPie;
                defaults.multibar_render = d3_renderMultiBar;
                defaults.multibar_convert = d3_convertMultiBar;
                defaults.horizontal_multibar_render = d3_renderHorizontalMultiBar;
                defaults.horizontal_multibar_convert = d3_convertHorizontalMultiBar;
            }
            
            // extend the defaults with the provided options
            var provided_options = $.extend(defaults, options);
            
            // copy in the defaults to the individual facets when they are needed
            for (var i=0; i < provided_options.facets.length; i=i+1) {
                var facet = provided_options.facets[i];
                if (!("type" in facet)) { facet["type"] = provided_options.default_facet_type }
                if (!("size" in facet)) { facet["size"] = provided_options.default_facet_size }
                if (!("order" in facet)) { facet["order"] = provided_options.default_facet_order }
                if (!("unit" in facet)) { facet["unit"] = provided_options.default_distance_unit }
                if (!("lat" in facet)) { facet["lat"] = provided_options.default_distance_lat }
                if (!("lon" in facet)) { facet["lon"] = provided_options.default_distance_lon }
                if (!("value_function" in facet)) { facet["value_function"] = function(value) { return value } }
                if (!("facet_label_field" in facet)) { facet["facet_label_field"] = provided_options.default_facet_label_field }
                if (!("facet_value_field" in facet)) { facet["facet_value_field"] = provided_options.default_facet_value_field }
            }
            
            return provided_options
        }
        
        /******************************************************************
         * DEBUG
         *****************************************************************/

        function addDebug(msg, context) {
            $(".reportview_debug", context).show().find("textarea").append(msg + "\n\n")
        }
        
        /**************************************************************
         * DATA FUNCTIONS
         *************************************************************/
        
        function simpleDataSeries(callback) {
            callback(options.data_series)
        }
        
        function facetDataSeries(callback) {
            // make the search query
            var queryobj = elasticSearchQuery({"options" : options});
            options.queryobj = queryobj;
            if (options.debug) {
                var querystring = serialiseQueryObject(queryobj);
                addDebug(querystring)
            }
            
            function querySuccess(rawdata, results) {
                if (options.debug) {
                    addDebug(JSON.stringify(rawdata));
                    addDebug(JSON.stringify(results))
                }
                
                // record the data coming from elasticsearch
                options.rawdata = rawdata;
                options.data = results;
                
                // for each facet, get the results and add them to the options
                var data_series = [];
                for (var each = 0; each < options.facets.length; each++) {
                    // get the facet, the field name and the size
                    var facet = options.facets[each];
                    var field = facet['field'];
                    var size = facet["size"] ? facet["size"] : options.default_facet_size;
                    
                    // get the records to be displayed, limited by the size and record against
                    // the options object
                    var records = results["facets"][field];
                    if (!records) { records = [] }
                    facet["values"] = records.slice(0, size);
                    
                    // now convert the facet values into the data series
                    if (!facet.series_function) {
                        var series = {};
                        series["key"] = facet["display"];
                        series["values"] = [];
                        for (var i = 0; i < facet["values"].length; i++) {
                            var result = facet["values"][i];
                            var display = result[facet.facet_label_field];
                            if (facet.value_function) {
                                display = facet.value_function(display)
                            }
                            series.values.push({"label": display, "value": result[facet.facet_value_field]})
                        }
                        data_series.push(series)
                    } else {
                        var custom_series = facet.series_function(options, facet);
                        data_series = data_series.concat(custom_series)
                    }
                }
                
                // finally, hit the callback
                callback(data_series)
            }
            
            // issue the query to elasticsearch
            doElasticSearchQuery({
                search_url: options.search_url,
                queryobj: queryobj,
                datatype: options.datatype,
                success: querySuccess //,
                // complete: queryComplete
            })
        }
        
        /**************************************************************
         * build all of the fragments that we want to render
         *************************************************************/
        
        // set the externally facing reportview options
        $.fn.report.options = deriveOptions();
        var options = $.fn.report.options;
        
        var thereportview = options.render_the_reportview(options);
        
        // now create the plugin on the page for each div
        var obj = undefined;
        return this.each(function() {
            // get this object
            obj = $(this);
            var element_id = obj.attr("id");
            
            // what to do when ready to go
            var whenready = function() {
                obj.append(thereportview);
                
                // if a post initialisation callback is provided, run it
                if (typeof options.post_init_callback === 'function') {
                    options.post_init_callback(options, obj);
                }
                
                // determine the correct data function
                
                // if there is a data function provided, use it
                var data_function = options.data_function;
                
                // if there is no data function provided, but facets are defined, use them
                if (!data_function) {
                    if (options.facets.length > 0) {
                        data_function = facetDataSeries
                    }
                }
                
                // if still no data function, then fall back to simple data series
                if (!data_function) {
                    data_function = simpleDataSeries
                }
                
                // now set the data function on the options object, so it can be accessed elsewhere
                options.data_function = data_function;
                
                // get the convert and render functions
                var render = options.type + "_render";
                var convert = options.type + "_convert";
                var renderFn = options[render];
                var convertFn = options[convert];
                
                // execute the data function and send it the chain to process after
                function onwardClosure(convertFn, renderFn) {
                    function onward(data_series) {
                        // record the data series
                        options.data_series = data_series;
                        
                        // if a pre render callback is provided, run it
                        if (typeof options.pre_render_callback === 'function') {
                            options.pre_render_callback(options, obj);
                        }
                        
                        // convert and render the series
                        var series = convertFn({"data_series" : options.data_series});
                        renderFn({
                            "context" : obj,
                            "data_series" : series,
                            "svg_selector" : "#" + element_id + " .reportview svg",
                            "div_selector" : element_id,
                            "options" : options
                        });
                        
                        // if a post render callback is provided, run it
                        if (typeof options.post_render_callback === 'function') {
                            options.post_render_callback(options, obj);
                        }
                    }
                    return onward
                }
                data_function(onwardClosure(convertFn, renderFn))
                
            };
            whenready();
        });
    }
})(jQuery);
