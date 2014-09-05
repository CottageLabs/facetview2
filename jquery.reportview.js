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
    var test = ["a", "b", "c", ]  // note trailing comma, will produce ["a", "b", "c", undefined] in IE8 and ["a", "b", "c"] in every sane browser
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
    var thereportview = '<div class="reportview"><svg></svg></div>';
    return thereportview
}

/******************************************************************
 * CHART CONVERT/RENDER FUNCTIONS
 *****************************************************************/

function convertDataPie(params) {
    var data_series = params.data_series
    return data_series
}

function renderPie(params) {
    var context = params.context
    var data_series = params.data_series
    var selector = params.svg_selector
    var options = params.options
    
    var show_labels = options.pie_show_labels
    var label_threshold = options.pie_label_threshold
    var be_donut = options.pie_donut
    var transition_duration = options.pie_transition_duration
    
    //var label_field = params.label_field
    //var value_field = params.value_field
    
    //var name = params["name"]
    
    //var datums = []
    //var pie = {"key" : name, "values" : []}
    
    //for (var i = 0; i < data.length; i++) {
    //    var helping = {}
    //    helping["label"] = data[i][label_field]
    //    helping["value"] = data[i][value_field]
    //    pie.values.push(helping)
    //}
    //datums.push(pie)
    
    // set the space up for the new chart
    $(selector, context).empty()
    // $(selector, context).css("height", "365px")
    
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

/******************************************************************
 * REPORT VIEW
 *****************************************************************/

(function($){
    $.fn.report = function(options) {
        var defaults = {
            // type of graph to draw
            "type" : "pie",
            
            // render the frame within which the reportview sits
            "render_the_reportview" : theReportview,
            
            // convert/render functions for pie chart
            "render_pie" : renderPie,
            "convert_pie" : convertDataPie,
            "pie_show_labels" : true,
            "pie_label_threshold" : 0.05,
            "pie_donut" : true,
            "pie_transition_duration" : 500,
            
            // data from which to build the graph
            "data_series" : false,
            "data_function" : false
        }
        
        function deriveOptions() {
            // cleanup for ie8 purposes
            ie8compat(options)
            ie8compat(defaults)
            
            // extend the defaults with the provided options
            var provided_options = $.extend(defaults, options);
            
            return provided_options
        }
        
        /**************************************************************
         * DATA FUNCTIONS
         *************************************************************/
        
        function simpleDataSeries() {
            return options.data_series
        }
        
        /**************************************************************
         * build all of the fragments that we want to render
         *************************************************************/
        
        // set the externally facing reportview options
        $.fn.report.options = deriveOptions()
        var options = $.fn.report.options;
        
        var thereportview = options.render_the_reportview(options)
        
        // now create the plugin on the page for each div
        var obj = undefined;
        return this.each(function() {
            // get this object
            obj = $(this);
            var element_id = obj.attr("id")
            
            // what to do when ready to go
            var whenready = function() {
                obj.append(thereportview)
                
                // determine the correct data function
                var data_function = options.data_function
                if (!data_function) {
                    data_function = simpleDataSeries
                }
                
                // get the convert and render functions
                var render = "render_" + options.type
                var convert = "convert_" + options.type
                var renderFn = options[render]
                var convertFn = options[convert]
                
                // execute the data function
                var data_series = data_function()
                var series = options[convert]({"data_series" : data_series})
                options[render]({
                    "context" : obj,
                    "data_series" : series,
                    "svg_selector" : "#" + element_id + " .reportview svg",
                    "options" : options
                })
            }
            whenready();
        });
    }
})(jQuery);
