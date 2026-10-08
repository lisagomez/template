/**
 * Nombres y apellidos COMUNES en México: una señal MÁS del anonimizador, nunca la única (PRP-010 H-04). Un nombre
 * se sigue reconociendo, ante todo, porque no es vocabulario (`lexico.ts`) o por su contexto (un tratamiento, una
 * firma, un verbo de reporte). Esta lista cubre lo que eso no ve: el nombre en minúsculas y sin contexto
 * («pepe gonzalez de almacen»), el usuario hecho de inicial y apellido («jgarcia») y el texto todo en mayúsculas.
 *
 * Límite declarado: un nombre en minúsculas, sin contexto y que no está aquí PASA. Por eso el anonimizador no
 * promete «cero fugas», y el texto de la AISIA tampoco puede prometerlo (D9: se mide sobre un corpus real).
 *
 * Fuera de la lista, a propósito, los nombres que también son palabras de los tickets (Dolores, Rosa, Luz,
 * Mercedes, Julio, Marco, Ángel; Flores, Torres, Fuentes, Mora, Cortes, Salas, Ramos…): taparlos borraría lo
 * técnico. Esos se reconocen solo por la mayúscula o por el contexto.
 */
import { normalizaPalabra } from './lexico.js'

const DE_PILA = `maria guadalupe juana margarita veronica josefina leticia teresa patricia elizabeth martha alejandra
gabriela adriana claudia silvia araceli laura gloria ana monica sandra angelica yolanda lucia elena carmen
isabel beatriz susana irma maribel fernanda daniela valeria ximena regina camila sofia andrea mariana paulina karla
karen diana liliana lorena erika alma brenda cecilia cristina graciela raquel rebeca sara julia natalia paola
viridiana marisol nancy jessica berenice itzel xochitl citlali fabiola rocio miriam ofelia olga estela hilda irene
lourdes magdalena maricela rosalba rosario samantha tania vanessa wendy yesenia zulema alicia eugenia gisela ivonne
jazmin judith lizbeth marcela marina minerva nayeli nora selene azucena noemi ruth esther lidia elsa ines aida
jose juan luis carlos jesus miguel francisco antonio alejandro jorge pedro manuel ricardo roberto fernando javier
sergio rafael daniel eduardo arturo alberto raul mario martin oscar hector enrique gerardo gabriel david victor
alfredo ramon ruben guillermo ernesto rodrigo hugo adrian andres diego santiago sebastian emiliano mateo
leonardo rogelio octavio ignacio gustavo joel abel alan benito cristian efrain emilio esteban felipe gilberto
gonzalo homero humberto isaac ismael ivan jaime joaquin jonathan lorenzo mauricio moises nicolas noe omar
orlando pablo ramiro rene saul ulises uriel valentin xavier alonso agustin aldo fabian fidel rolando samuel
teodoro adolfo alfonso alvaro bernardo braulio cuauhtemoc ezequiel gregorio horacio israel jacinto leopoldo lucio
marcelo maximiliano nestor osvaldo patricio porfirio reynaldo rigoberto rosendo wilfrido hermenegildo
pepe pepa chuy chucho tono tona lupe lupita paty pati maru lalo paco pancho nacho beto chema chela chelo
conchita lencho licha lulu meche migue nando pili poncho quique rafa tavo tere tito vicky yola charly chayo chabela
checo chepe gaby gabo juanito juanita kike lucha manolo mari marisa nacha nati rosy susy tony xime jime dany cris
javi santi sebas mau toncho goyo chencho chalo nico fito`

const APELLIDOS = `hernandez garcia martinez lopez gonzalez perez rodriguez sanchez ramirez gomez diaz morales jimenez
gutierrez ruiz mendoza alvarez castro romero herrera medina aguilar chavez vargas ibarra mejia soto contreras silva
lara zuniga espinoza sandoval carrillo dominguez trevino garza villarreal cantu elizondo salinas acosta valdez rangel
galvan orozco zamora velazquez cervantes maldonado camacho rosales quintero olvera pineda trejo beltran
 miranda ochoa padilla solis nava becerra bautista benitez arellano avila cardenas cisneros escobar esquivel
figueroa gallegos guerrero lozano macias marquez montoya munoz osorio quiroz rocha tapia toledo villegas zavala
ugalde quintanilla villanueva aguirre alvarado andrade arriaga calderon carrasco davila estrada pacheco salazar
ortiz ortega guzman juarez vazquez navarro rivera cabrera villa santana sosa fuentevilla tovar
yanez zepeda zarate vidal velasco valle urbina tellez saucedo rendon resendiz ponce olivares nunez
mireles lugo loera leyva jaramillo hinojosa guevara gamez fierro escamilla enriquez duarte cordova
coronado cortez colin chavarria ceballos bustos bermudez barragan arias anaya alcantara alcala aguayo`

const conjunto = (lista: string) => new Set(lista.split(/\s+/).filter(Boolean))
const PILA: ReadonlySet<string> = conjunto(DE_PILA)
const APELLIDO: ReadonlySet<string> = conjunto(APELLIDOS)

export const esNombreDePila = (palabra: string): boolean => PILA.has(normalizaPalabra(palabra))
export const esApellido = (palabra: string): boolean => APELLIDO.has(normalizaPalabra(palabra))
export const esNombreConocido = (palabra: string): boolean => esNombreDePila(palabra) || esApellido(palabra)
