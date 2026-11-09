// Ícones dos satélites e naves, tirados do mapa de fotogrametria (map3d.js). O nariz aponta para +x.
export const craftIcon = {};
    (function buildCraftIcons() {
      function sheet(draw) {
        const s = 96;
        const c = document.createElement("canvas");
        c.width = c.height = s;
        const g = c.getContext("2d");
        g.strokeStyle = "#fff";
        g.lineWidth = 4;
        g.lineJoin = "round";
        g.lineCap = "round";
        draw(g);
        return c;
      }
      function rect(g, x, y, w, h) {
        g.strokeRect(x, y, w, h);
      }
      // Simplified station, outline. Long axis is +x, along the velocity.
      craftIcon.iss = sheetFine((g) => {
        g.lineWidth = 3.4;
        g.strokeRect(24, 46, 14, 100);
        g.strokeRect(46, 46, 14, 100);
        g.strokeRect(132, 46, 14, 100);
        g.strokeRect(154, 46, 14, 100);
        g.strokeRect(16, 88, 160, 14);
        g.strokeRect(86, 34, 20, 10);
        g.strokeRect(92, 44, 8, 12);
        g.strokeRect(82, 56, 28, 32);
        g.strokeRect(92, 102, 8, 20);
        g.strokeRect(80, 122, 32, 10);
      });
      craftIcon.hubble = sheet((g) => {
        rect(g, 40, 16, 16, 64);
        g.beginPath();
        g.ellipse(48, 16, 8, 4, 0, 0, Math.PI * 2);
        g.moveTo(8, 32);
        g.lineTo(36, 32);
        g.lineTo(36, 64);
        g.lineTo(8, 64);
        g.closePath();
        g.moveTo(60, 32);
        g.lineTo(88, 32);
        g.lineTo(88, 64);
        g.lineTo(60, 64);
        g.closePath();
        g.stroke();
      });
      craftIcon.tiangong = sheet((g) => {
        rect(g, 12, 40, 22, 16);
        rect(g, 34, 42, 28, 12);
        rect(g, 62, 40, 22, 16);
        rect(g, 42, 18, 12, 24);
        rect(g, 42, 54, 12, 24);
      });
      craftIcon.landsat = sheet((g) => {
        rect(g, 30, 34, 26, 28);
        rect(g, 56, 26, 30, 44);
        rect(g, 36, 18, 14, 16);
        g.beginPath();
        g.moveTo(56, 36);
        g.lineTo(56, 60);
        g.stroke();
      });
      craftIcon.sentinel = sheet((g) => {
        rect(g, 40, 32, 26, 30);
        rect(g, 10, 28, 30, 40);
        rect(g, 48, 12, 10, 20);
        g.beginPath();
        g.moveTo(40, 40);
        g.lineTo(40, 54);
        g.stroke();
      });
      craftIcon.gps = sheet((g) => {
        rect(g, 40, 34, 16, 28);
        rect(g, 8, 42, 32, 12);
        rect(g, 56, 42, 32, 12);
        g.beginPath();
        g.moveTo(48, 34);
        g.lineTo(48, 22);
        g.moveTo(42, 22);
        g.lineTo(54, 22);
        g.stroke();
      });
      craftIcon.goes = sheet((g) => {
        rect(g, 26, 40, 24, 22);
        rect(g, 16, 24, 20, 16);
        g.beginPath();
        g.arc(68, 50, 16, 0, Math.PI * 2);
        g.moveTo(50, 50);
        g.lineTo(52, 50);
        g.stroke();
      });
      craftIcon.starlink = sheet((g) => {
        rect(g, 14, 30, 68, 36);
        g.beginPath();
        g.moveTo(31, 30);
        g.lineTo(31, 66);
        g.moveTo(48, 30);
        g.lineTo(48, 66);
        g.moveTo(65, 30);
        g.lineTo(65, 66);
        g.moveTo(14, 48);
        g.lineTo(82, 48);
        g.stroke();
        rect(g, 40, 66, 16, 12);
      });
      // Finer sheet so the capsule shoulder and the Starship flaps survive.
      // Nose still points +x, which the painter aligns with the velocity.
      function sheetFine(draw) {
        const s = 192;
        const c = document.createElement("canvas");
        c.width = c.height = s;
        const g = c.getContext("2d");
        g.strokeStyle = "#fff";
        g.lineWidth = 3.4;
        g.lineJoin = "round";
        g.lineCap = "round";
        draw(g);
        return c;
      }
      // Top view from Illustrator/dragon.svg. Nose points +x.
      craftIcon.dragon = sheetFine((g) => {
        const hull = "M132.55,111.61l-.72-16.13c-2.6-7.36-5.32-14.52-8.27-21.67l-.87-.4c-.04-1.32-.36-2.55-.89-3.67l-1.93-4.13c-3.52-7.52-7.28-14.78-11.95-21.67-6.52-9.6-16.82-21.4-29.04-15.73-14.39,6.68-26.52,33.19-32.6,47.86-2.64,6.38-5.03,12.57-7.29,19.21-.45,3.01-.38,6.3-.52,9.5l-.73,17.29-.23,4.69c-.19,3.98,1.67,6.87,5.78,7.66h83.85c1.78-.42,3.34-.73,4.5-2.24.91-1.19,1.69-2.93,1.62-4.45l-.71-16.12ZM126.86,91.58c.09.24.1.59.08.92-.01.24-.04.48-.07.64.21.35.39.74.52,1.16.28.81.41,1.67.33,2.45-.62-1.13-1.54-1.25-2.64-1.31-1.44-.09-2.9.49-3.29,2.06l-3.63,14.83-.91,3.87s-.01.03-.01.04c-.45,2.32-.9,4.65-1.35,6.97-.15.33-.62-.09-.69-.45-.06-.31-.11-.62-.16-.93l-.1.48c-.09-.15-.17-.31-.23-.46l-.24-1.86c.03-.36.1-.73.18-1.1-.07-.63-.12-1.26-.16-1.9l-.15.68c-.17-.53-.28-1.09-.37-1.69l-.24-1.86s0-.07-.01-.11l-.05-.38-2.85-22.53s0,0,0,0l-.09-.64-.3-2.36c1.57-2.53,1.89-7.29.58-12.4-.72-2.79-1.8-5.26-3.06-7.17l-1.35-10.72c.02-.17.05-.35.09-.52l2.09-5.33c7.38,12.65,12.93,26.19,18.06,39.63ZM122.41,124.84l7.12.21c.43.74.36,2.05-.4,2.79H42.14c-.74-.7-.93-1.81-.45-2.77l5.33-.17,6.4-.08h10.75l.03.03,2.37-.03h2.25s53.59.02,53.59.02ZM105.56,57.45l1.2,9.49c-1.61-1.85-3.39-2.78-4.98-2.38-3.33.85-4.58,7.21-2.8,14.2.76,2.99,1.95,5.62,3.33,7.57.36.52.74.99,1.13,1.41h-.01s0,.03.03.03h0c.7.77,1.44,1.36,2.18,1.74.88.45,1.75.6,2.57.39.49-.13.94-.38,1.34-.74l4.38,34.67h-57.03l4.36-34.55c.36.29.76.51,1.19.62.58.15,1.19.12,1.8-.08.91-.27,1.84-.9,2.72-1.8.15-.15.3-.31.44-.47.3-.34.6-.72.88-1.12,1.41-1.97,2.63-4.63,3.4-7.67,1.78-6.99.53-13.35-2.79-14.2-1.53-.39-3.23.46-4.79,2.17l1.16-9.15.02-.13-1.49-3.8c-.27-1.02-.55-2.04-.81-3.09-.08-.28.02-.76.18-1.05.82-.13,2.05-.32,3.55-.54,5-.66,12.7-1.53,18.71-1.57,6,.04,13.7.91,18.71,1.57,1.39.2,2.55.38,3.36.51.52.87-.28,2.97-.89,5.32l-1.05,2.66ZM75.19,34.56c3.18-2.72,7.81-5.03,11.89-4.35,6.15,1.02,12.69,7.86,16.08,12.93l3.43,5.14-4.48-.68-7.34-.82-.92-.02c-2.7-.23-5.44-.38-7.96-.38-.15,0-.3,0-.46,0-.15,0-.31,0-.46,0-2.47,0-5.17.15-7.83.37h-.62s-2.01.24-2.01.24c-2.92.3-5.66.65-7.84.96-1.01.13-1.92.26-2.68.37,3.27-5.28,6.51-9.76,11.19-13.76ZM43,95.93c.06-.58.13-1.14.3-1.65-.13-.05-.22-.12-.24-.23-.02-.11.01-.21.04-.31.15-.51.35-1.01.59-1.49,5.25-14.1,10.97-27.75,18.32-40.46l2.09,5.33c-.03,1.01-.09,2.01-.21,3-.08,1.12-.32,2.17-.47,3.28l-.59,4.99c-1.3,1.93-2.41,4.44-3.14,7.3-1.32,5.17-.98,10,.64,12.5h0s-.5,3.99-.5,3.99l-.68,5.48-.72,5.63-.74,5.77-.77,5.73-.13,2.13-.11.88c-.08-.07-.22-.18-.23-.18,0,.01-.05.06-.1.1-.07.66-.15,1.32-.22,1.98.07.84-.03,1.75-.28,2.66l-.02-.09c-.01.15-.03.31-.05.46-.22-.38-.42-.77-.59-1.16.11.57.15,1.11-.02,1.65l-1.21-5-.98-4.07s0-.04,0-.06l-3.14-13c-.41-1.71-.58-3.66-1.82-4.98-1.02-1.09-3.42-.8-4.4-.02l-.41.32c-.06.05-.25.05-.25-.03l.05-.45Z";
        const hatch = "M97.25,86.19c-.02-.67-.08-1.34-.14-1.9l-.7-6.31-.29-2.34-.96-8.92c-.22-2.1-1.99-3.68-4.1-3.68h-11.76c-2.1,0-3.86,1.57-4.1,3.65l-2.32,20.19c-.13,1.17.24,2.34,1.02,3.21.78.88,1.9,1.38,3.08,1.38h16.25c1.17,0,2.29-.5,3.07-1.37.78-.87,1.16-2.04,1.03-3.2l-.08-.72ZM73.87,86.99l2.32-20.19c.08-.67.37-1.27.8-1.74.24-.19.5-.42.77-.62.46-.26.98-.41,1.53-.41h11.76c1.6,0,2.94,1.2,3.11,2.79l2.17,20.19c.09.88-.19,1.76-.78,2.42-.42.47-.97.78-1.57.93-.21.04-.42.07-.63.07l-16.31-.03c-1.03,0-1.9-.46-2.51-1.15-.5-.64-.75-1.45-.65-2.27Z";
        const minX = 37.5, minY = 28.2, maxX = 133.3, maxY = 134.4;
        const sc = 168 / (maxY - minY);
        g.save();
        g.translate(96, 96);
        g.rotate(Math.PI / 2);
        g.scale(sc, sc);
        g.translate(-(minX + maxX) / 2, -(minY + maxY) / 2);
        g.fillStyle = "#fff";
        g.fill(new Path2D(hull));
        g.fill(new Path2D(hatch));
        g.restore();
      });
      craftIcon.sputnik = sheet((g) => {
        g.beginPath();
        g.arc(68, 48, 12, 0, Math.PI * 2);
        g.moveTo(56, 48);
        g.ellipse(68, 48, 12, 3.6, 0, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        // Two long whips, two short. They trail behind the direction of flight.
        g.moveTo(58, 40);
        g.lineTo(4, 8);
        g.moveTo(58, 56);
        g.lineTo(4, 88);
        g.moveTo(62, 44);
        g.lineTo(28, 30);
        g.moveTo(62, 52);
        g.lineTo(28, 66);
        g.stroke();
      });
      // Starship outline. Nose points +x. Aft flaps stay gapped off the hull.
      craftIcon.starship = sheetFine((g) => {
        g.lineWidth = 4.2;
        g.beginPath();
        g.moveTo(182, 96);
        g.lineTo(177.7, 91.9);
        g.lineTo(173.4, 88.5);
        g.lineTo(166.5, 85.6);
        g.lineTo(159.6, 77.4);
        g.lineTo(152.8, 69.3);
        g.lineTo(140.7, 68.2);
        g.lineTo(138.1, 80.3);
        g.lineTo(10, 80.3);
        g.lineTo(10, 111.7);
        g.lineTo(138.1, 111.7);
        g.lineTo(140.7, 123.8);
        g.lineTo(152.8, 122.7);
        g.lineTo(159.6, 114.6);
        g.lineTo(166.5, 106.4);
        g.lineTo(173.4, 103.5);
        g.lineTo(177.7, 100.1);
        g.closePath();
        g.moveTo(10, 67);
        g.lineTo(10, 75.4);
        g.lineTo(56.4, 75.4);
        g.lineTo(44.4, 69.3);
        g.lineTo(35.8, 67);
        g.closePath();
        g.moveTo(10, 125);
        g.lineTo(10, 116.6);
        g.lineTo(56.4, 116.6);
        g.lineTo(44.4, 122.7);
        g.lineTo(35.8, 125);
        g.closePath();
        g.stroke();
      });
    })();
    // Shell is orbit radius in Earth radii. True LEO is 1.06–1.12 and
    // GPS/GEO are 4.2 and 6.6, which fall outside the 7° sky. These keep
