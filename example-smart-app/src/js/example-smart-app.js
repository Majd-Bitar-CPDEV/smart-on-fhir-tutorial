/* global FHIR, $, window */
(function (window) {
  /**
   *  MAIN ENTRY ────────────────
   *  Returns a jQuery-style promise that resolves with a
   *  “patient summary” object ready for drawVisualization().
   */
  window.extractData = function () {
    const dfd = $.Deferred();

    function onError() {
      console.error('Loading error', arguments);
      dfd.reject();
    }

    function onReady(smart) {
      if (!smart.patient) {
        return onError();
      }

      // ── 1) fetch Patient + Observations in parallel ─────────────
      const ptPromise  = smart.patient.read();
      const obsPromise = smart.patient.api.fetchAll({
        type: 'Observation',
        query: {
          code: {
            $or: [
              'http://loinc.org|8302-2', // Height
              'http://loinc.org|8462-4', // Diastolic BP
              'http://loinc.org|8480-6', // Systolic BP
              'http://loinc.org|2085-9', // HDL
              'http://loinc.org|2089-1', // LDL
              'http://loinc.org|55284-4' // BP panel
            ]
          }
        }
      });

      $.when(ptPromise, obsPromise).fail(onError);

      $.when(ptPromise, obsPromise).done(function (patient, observations) {
        //------------------------------------------------------------------
        // 2)  DEMOGRAPHICS
        //------------------------------------------------------------------
        const nameObj = (patient.name && patient.name.length) ? patient.name[0] : {};
        const given   = Array.isArray(nameObj.given)  ? nameObj.given.join(' ')   : (nameObj.given   || '');
        const family  = Array.isArray(nameObj.family) ? nameObj.family.join(' ')  : (nameObj.family  || '');

        //------------------------------------------------------------------
        // 3)  CLINICAL OBSERVATIONS
        //------------------------------------------------------------------
        const byCode      = smart.byCodes(observations, 'code');
        const heightObs   = byCode('8302-2');
        const bpPanel     = byCode('55284-4');
        const systolicBP  = pickBP(bpPanel, '8480-6');
        const diastolicBP = pickBP(bpPanel, '8462-4');
        const hdlObs      = byCode('2085-9');
        const ldlObs      = byCode('2089-1');

        //------------------------------------------------------------------
        // 4)  BUILD SUMMARY OBJECT
        //------------------------------------------------------------------
        const summary = {
          fname:       given,
          lname:       family,
          gender:      patient.gender || '',
          birthdate:   patient.birthDate || '',
          height:      quantity(heightObs[0]),
          systolicbp:  systolicBP,
          diastolicbp: diastolicBP,
          hdl:         quantity(hdlObs[0]),
          ldl:         quantity(ldlObs[0])
        };

        dfd.resolve(summary);
      });
    }

    FHIR.oauth2.ready(onReady, onError);
    return dfd.promise();
  };

  // ────────────────────────────────────────────────────────────────────
  //  HELPERS
  // ────────────────────────────────────────────────────────────────────
  function pickBP(panel, loincCode) {
    if (!panel || !panel.length) return undefined;

    // Find the component that matches the desired systolic/diastolic code
    const match = panel.find(obs => {
      const comp = (obs.component || []).find(c =>
        (c.code?.coding || []).some(cd => cd.code === loincCode)
      );
      if (comp) {
        // mutate so quantity() can reuse the same util
        obs.valueQuantity = comp.valueQuantity;
        return true;
      }
      return false;
    });

    return quantity(match);
  }

  function quantity(observation) {
    const q = observation?.valueQuantity;
    return (q && q.value !== undefined && q.unit)
      ? `${q.value} ${q.unit}`
      : undefined;
  }

  // ────────────────────────────────────────────────────────────────────
  //  DRAW
  // ────────────────────────────────────────────────────────────────────
  window.drawVisualization = function (p) {
    $('#holder').show();
    $('#loading').hide();
    $('#fname').text(p.fname);
    $('#lname').text(p.lname);
    $('#gender').text(p.gender);
    $('#birthdate').text(p.birthdate);
    $('#height').text(p.height);
    $('#systolicbp').text(p.systolicbp);
    $('#diastolicbp').text(p.diastolicbp);
    $('#ldl').text(p.ldl);
    $('#hdl').text(p.hdl);
  };
})(window);
