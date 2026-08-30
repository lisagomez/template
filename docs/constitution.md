# Constitución — SaaS Factory

Principios innegociables. Toda spec, plan y tarea debe cumplirlos.

1. **Un solo stack**: el Golden Path se ejecuta, no se debate. No se ofrecen
   alternativas técnicas al usuario ni se introduce un stack paralelo.
2. **La spec manda**: ningún comportamiento se implementa si no está en la spec
   activa. Si falta una decisión, se detiene el trabajo y se pregunta.
3. **Núcleo separado de interfaz**: el núcleo de una herramienta no importa React,
   Next ni Supabase; lo que los necesite vive en un entry point aparte. Cada
   feature lleva su contexto completo en su carpeta.
4. **Los gates son puerta, no consejo**: `npm run validate` en verde o el cambio no
   se promueve. Un gate que depende de que alguien se acuerde es una costumbre.
5. **Nada se afirma sin medir**: sin medición, "desconocido". Una cifra sin fuente
   es peor que un hueco declarado, y lo documentado y nunca ejecutado es una
   afirmación, no una capacidad.
6. **El dato ajeno no es del dueño**: RLS siempre y `service_role` fuera de las
   superficies de negocio. El daño sobre quien no firmó no se autoriza con una firma.
7. **Cambiar al agente es cambiar código**: modelo, skill, prompt o plantilla exigen
   diff, regresión y aprobación humana. Todo pineado; `latest` se rechaza.
8. **Idioma**: código e identificadores en inglés; mensajes, documentación y
   respuestas en español.
