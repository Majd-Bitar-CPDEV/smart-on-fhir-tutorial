/* global FHIR, $, window */
(function (window) {
  // ──────────────────────────────────────────────────────────────
  //  MAIN ENTRY – returns a Promise resolved with a patient “view-model”
  // ──────────────────────────────────────────────────────────────
  window.extractData = function () {
    const dfd = $.Deferred();

    //------------------------------------------------------------------
    // 1)  OAuth ready callback
    //------------------------------------------------------------------
    function onReady(smart) {
      if (!smart.patient) {
        return fail('SMART object has no patient');
      }

      // Fetch Patient + Observations in parallel
      const patientReq = smart.patient.read();
      const obsReq     = smart.patient.api.fetchAll({
        type: 'Observation',
        query: {
          code: {
            $or: [
              'http://loinc.org|8302-2', // Height
              'http://loinc.org|8462-4', // Diastolic BP
              'http://loinc.org|8480-6', // Systolic BP
              'http://loinc.org|2085-9', // HDL
              'http://loinc.org|2089-1', // LDL
              'http://loinc.org|55284-4' // Blood-pressure panel
            ]
          }
        }
      });

      $.when(patientReq, obsReq)
        .fail((...args) => fail('FHIR read error', args))
        .done((patient, observations) => dfd.resolve(buildSummary(patient, observations, smart)));
    }

    FHIR.oauth2.ready(onReady, (...args) => fail('OAuth ready error', args));
    return dfd.promise();

    // --- helpers within extractData scope ---
    function fail(msg, args) {
      console.error(msg, args);
      dfd.reject(msg);
    }
  };

  // ──────────────────────────────────────────────────────────────
  //  BUILD SUMMARY OBJECT
  // ──────────────────────────────────────────────────────────────
  function buildSummary(patient, observations, smart) {
    //  Demographics ─────────────────────────────────────────────
    const name      = Array.isArray(patient.name) && patient.name.length ? patient.name[0] : {};
    const given     = Array.isArray(name.given)  ? name.given.join(' ')  : (name.given  || '');
    const family    = Array.isArray(name.family) ? name.family.join(' ') : (name.family || '');

    //  Observations helper
    const byCode    = smart.byCodes(observations, 'code');

    const heightObs = firstOf(byCode('8302-2'));
    const bpPanel   = byCode('55284-4');
    const hdlObs    = firstOf(byCode('2085-9'));
    const ldlObs    = firstOf(byCode('2089-1'));

    //  Blood-pressure components
    const systolic  = pickBP(bpPanel, '8480-6');
    const diastolic = pickBP(bpPanel, '8462-4');

    return {
      fname:       given,
      lname:       family,
      gender:      patient.gender  || '',
      birthdate:   patient.birthDate || '',
      height:      quantity(heightObs),
      systolicbp:  systolic,
      diastolicbp: diastolic,
      hdl:         quantity(hdlObs),
      ldl:         quantity(ldlObs)
    };
  }

  // ──────────────────────────────────────────────────────────────
  //  QUANTITY & BP HELPERS
  // ──────────────────────────────────────────────────────────────
  function quantity(obs) {
    const q = obs?.valueQuantity;
    return (q && q.value !== undefined && q.unit)
      ? `${q.value} ${q.unit}`
      : undefined;
  }

  function pickBP(panelArr, loinc) {
    if (!Array.isArray(panelArr) || !panelArr.length) return undefined;

    const match = panelArr.find(obs =>
      (obs.component || []).some(comp =>
        (comp.code?.coding || []).some(cd => cd.code === loinc)
      )
    );

    if (!match) return undefined;

    // move the matched component’s value into valueQuantity so `quantity()` can read it
    const comp = match.component.find(c =>
      (c.code.coding || []).some(cd => cd.code === loinc)
    );
    match.valueQuantity = comp.valueQuantity;
    return quantity(match);
  }

  const firstOf = arr => (Array.isArray(arr) && arr.length ? arr[0] : undefined);

  // ──────────────────────────────────────────────────────────────
  //  DRAW FUNCTION  – called from index.html after extractData()
  // ──────────────────────────────────────────────────────────────
  window.drawVisualization = function (p) {
    $('#loading').hide();
    $('#holder').show();

    $('#fname').text(p.fname);
    $('#lname').text(p.lname);
    $('#gender').text(p.gender);
    $('#birthdate').text(p.birthdate);
    $('#height').text(p.height);
    $('#systolicbp').text(p.systolicbp);
    $('#diastolicbp').text(p.diastolicbp);
    $('#hdl').text(p.hdl);
    $('#ldl').text(p.ldl);
  };
})(window);
